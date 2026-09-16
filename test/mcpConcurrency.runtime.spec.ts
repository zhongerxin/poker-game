import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { expect, it } from 'vitest';

// 并发回归测试：MCP handler 必须按请求构建 server。
// createMcpHandler 会为每个请求新建 transport 并调用 server.connect()，而
// Protocol.connect() 直接覆盖内部 _transport。若 server 是模块级单例，同一
// isolate 内的并发请求会互相抢写 transport，部分请求会拿到 HTTP 200 但 body
// 为空，客户端永远等不到 JSON-RPC 响应。
const CONCURRENCY = 10;

it('returns a JSON-RPC response for every concurrent /mcp request', async () => {
  const bundle = await build({
    stdin: {
      contents: `export { default, PokerDO } from './src/worker/index';`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    // 这些由 workerd 在运行时提供（nodejs_compat），不打进 bundle。
    conditions: ['workerd', 'worker', 'browser', 'module', 'import'],
    external: ['cloudflare:workers', 'cloudflare:email', 'node:*', 'path'],
  });

  const mf = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-10-08',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: { POKER_DO: { className: 'PokerDO', useSQLite: true } },
    bindings: { GA4_ENABLED: 'false', POSTHOG_ENABLED: 'false', POKER_IDLE_TIMEOUT_MINUTES: '30' },
  });

  const callToolsList = async () => {
    const response = await mf.dispatchFetch('https://poker/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const text = await response.text();
    const dataLine = text.split('\n').find(line => line.startsWith('data: '));
    return {
      status: response.status,
      payload: dataLine ? JSON.parse(dataLine.slice(6)) : null,
    };
  };

  try {
    // 预热一次，确保生产环境常见的冷启动不影响并发断言。
    expect((await callToolsList()).payload?.result?.tools).toHaveLength(4);

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => callToolsList()),
    );

    const empty = results.filter(r => r.payload?.result?.tools === undefined);
    expect(
      empty.length,
      `${empty.length}/${CONCURRENCY} 个并发请求没有拿到 tools/list 结果（HTTP 状态：${empty.map(r => r.status).join(',') || '无'}）`,
    ).toBe(0);
    expect(results.every(r => r.status === 200)).toBe(true);
  } finally {
    await mf.dispose();
  }
}, 30_000);
