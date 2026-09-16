import { build } from 'esbuild';
import { Miniflare, Response } from 'miniflare';
import { expect, it } from 'vitest';

it('serves game reads and writes while an actual alarm waits for analytics', async () => {
  const bundle = await build({
    stdin: {
      contents: `export { PokerDO } from './src/worker/PokerDO';
        export default { fetch(req, env) {
          return env.POKER_DO.get(env.POKER_DO.idFromName('latency-test')).fetch(req);
        } };`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  let started!: () => void;
  const sending = new Promise<void>(resolve => { started = resolve; });
  let release!: () => void;
  const upstream = new Promise<void>(resolve => { release = resolve; });
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-10-08',
    durableObjects: { POKER_DO: { className: 'PokerDO', useSQLite: true } },
    bindings: { GA4_ENABLED: 'true', GA4_MEASUREMENT_ID: 'G-TEST', GA4_API_SECRET: 'test' },
    outboundService: async () => {
      started();
      await upstream;
      return new Response(null, { status: 204 });
    },
  });
  const timers: ReturnType<typeof setTimeout>[] = [];
  const within = <T>(promise: Promise<T>, ms: number) => Promise.race([
    promise,
    new Promise<never>((_, reject) => timers.push(setTimeout(() => reject(new Error(`Blocked for ${ms}ms`)), ms))),
  ]);
  try {
    const game = { id: 'table', deck: [], board: [], hero: {}, ai: {}, stage: 'preflop',
      handId: 'hand-1', analytics: { clientId: '123.456', identitySource: 'table_fallback', sessionId: 123 } };
    expect((await mf.dispatchFetch('https://poker/game', { method: 'POST', body: JSON.stringify(game) })).status).toBe(204);
    await within(sending, 10_000);
    const start = performance.now();
    const read = await within(mf.dispatchFetch('https://poker/game?id=table'), 500);
    const saved = await read.json() as typeof game;
    expect((await within(mf.dispatchFetch('https://poker/game', {
      method: 'POST', body: JSON.stringify({ ...saved, stage: 'afterflop' }),
    }), 500)).status).toBe(204);
    console.log(`Concurrent GET + POST during pending analytics: ${Math.round(performance.now() - start)}ms`);
  } finally {
    release();
    timers.forEach(clearTimeout);
    await mf.dispose();
  }
}, 20_000);
