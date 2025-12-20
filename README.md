# Poker Game on Cloudflare Workers

React + Vite + Hono + Cloudflare Workers 打造的德州扑克对战项目，前端用 React 渲染牌桌与牌面，后端 Worker 负责牌堆、摊牌逻辑以及通过 MCP 向模型暴露工具/资源。

## 目录结构
- `src/react-app/`：前端页面组件（`Table.tsx`、`Start.tsx` 等）。
- `src/worker/`：Cloudflare Worker 逻辑，工具注册、牌局状态、MCP handler。
  - `index.ts`：Worker 入口、工具注册。
  - `texts.ts`：工具描述与内容模板集中管理（多行模板字符串 + `stripIndent`）。
  - `PokerDO`：Durable Object 牌局存储。
- `src/widget/`：Skybridge/Widget HTML 模板。
- `test/`：Vitest 测试。
- `dist/`：Vite 构建产物（自动生成，勿手改）。

## 关键改动（近期）
- 工具描述与返回内容统一收敛到 `src/worker/texts.ts` 的 `toolDescriptions` / `contentTpl`，方便维护与换行。
- `poker.afterflop` 增加重复阶段调用保护：同一阶段已发牌则直接返回当前局面，不再抛错。
- `poker.showdown` 支持弃牌直接摊牌时自动补足剩余公牌，再结算底池。

## 开发与调试
```bash
npm install          # 安装依赖
npm run dev          # 前端开发服务器（Vite）
npm run dev:wrangler # 本地运行 Worker
npm run build        # 生成 dist/
npm run deploy       # Wrangler 部署
npx vitest           # 运行测试
```

## 注意事项
- 不要提交密钥；生产配置通过 Wrangler secrets 管理。
- 修改 Widget 模板请保持文件名小写短横线。
- Worker 中的文本请优先在 `src/worker/texts.ts` 修改，避免散落在业务代码里。
