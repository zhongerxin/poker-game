import { build } from 'esbuild';
import { Miniflare, Response } from 'miniflare';
import { expect, it } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

it('keeps the published tools compatible and supplies widget context through a whole hand', async () => {
  const bundle = await build({
    stdin: { contents: `export { default, PokerDO } from './src/worker/index';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
    conditions: ['workerd', 'worker', 'browser', 'module', 'import'],
    external: ['cloudflare:workers', 'cloudflare:email', 'node:*', 'path'],
  });
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-10-08', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { POKER_DO: { className: 'PokerDO', useSQLite: true } },
    bindings: { GA4_ENABLED: 'false', POSTHOG_ENABLED: 'false' },
    serviceBindings: { ASSETS: async () => new Response('<!doctype html><script type="module">/* widget */</script>') },
  });
  let requestId = 0;
  const request = async (method: string, params: Record<string, unknown> = {}) => {
    const response = await mf.dispatchFetch('https://poker/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    });
    expect(response.status).toBe(200);
    const dataLine = (await response.text()).split('\n').find(line => line.startsWith('data: '));
    const payload = JSON.parse(dataLine!.slice(6));
    expect(payload.error).toBeUndefined();
    return payload.result;
  };
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> => {
    const result = await request('tools/call', { name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    return result;
  };

  try {
    const { tools } = await request('tools/list');
    expect(tools.map((tool: { name: string }) => tool.name)).toEqual(['poker.tableConfig', 'poker.preflop', 'poker.afterflop', 'poker.showdown']);
    expect(tools.find((tool: { name: string }) => tool.name === 'poker.afterflop').inputSchema.required).toEqual(['stage', 'game_id', 'bet']);
    expect(tools[1]._meta['openai/outputTemplate']).toBe('ui://widget/table.html');
    const resource = await request('resources/read', { uri: 'ui://widget/table.html' });
    expect(resource.contents[0].text).toContain('window.__WIDGET_DEFAULT__="table"');

    const setup = await call('poker.tableConfig');
    const game_id = setup.structuredContent!.game_id;
    const deal = () => call('poker.preflop', { game_id, sb: 5, bb: 10, hero_stack: 200, ai_stack: 200 });
    const preflop = await deal();
    const hand_id = preflop.structuredContent!.hand_id;
    expect(hand_id).toEqual(expect.any(String));
    expect(preflop._meta).toMatchObject({ game_id, hand_id, stage: 'preflop', pot: 15, bb: 10, sb: 5 });
    expect(preflop.structuredContent).not.toHaveProperty('hero_hole');
    expect(preflop._meta).not.toHaveProperty('ai_hole');
    expect(preflop.structuredContent!.statusText).toContain('不得默认替 AI 跟注');
    expect(preflop.structuredContent!.statusText).toContain('folded_player="hero"');

    for (const [stage, boardLength] of [['afterflop', 3], ['turn', 4], ['river', 5]] as const) {
      const result = await call('poker.afterflop', { game_id, stage, bet: 10 });
      expect(result._meta).toMatchObject({ game_id, hand_id, stage });
      expect(result.structuredContent).toMatchObject({ game_id, hand_id, stage });
      expect(result.structuredContent!.statusText).toContain('先计算用户跟注后的底池');
      expect(result._meta!.board).toHaveLength(boardLength);
      expect(result._meta).not.toHaveProperty('ai_hole');
      const repeated = await call('poker.afterflop', { game_id, stage, bet: 10 });
      expect(repeated._meta!.pot).toBe(result._meta!.pot);
      expect(repeated._meta!.hero_stack).toBe(result._meta!.hero_stack);
    }
    const settled = await call('poker.showdown', { game_id, bet: 0, is_fold: false });
    expect(settled._meta).toMatchObject({ game_id, hand_id, stage: 'showdown', pot: 75 });
    expect(settled._meta!.ai_hole).toHaveLength(2);
    const next = await deal();
    expect(next._meta!.hand_id).not.toBe(hand_id);
    const folded = await call('poker.showdown', { game_id, bet: 0, is_fold: true, folded_player: 'hero' });
    expect(folded._meta!.stage).toBe('showdown');
    expect(folded.structuredContent!.winner).toBe('ai');
  } finally {
    await mf.dispose();
  }
}, 30_000);
