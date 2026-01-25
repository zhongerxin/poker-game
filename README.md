# Poker Game on Cloudflare Workers

React + Vite + Cloudflare Workers 的德州扑克对战项目：前端用 React 渲染牌桌与牌面，后端 Worker 负责牌局状态与 MCP 工具注册（供模型调用）。

## 目录结构
- `src/react-app/`：前端页面组件（`Table.tsx`、`Start.tsx` 等）。
- `src/worker/`：Cloudflare Worker 逻辑，工具注册、牌局状态、MCP handler。
  - `index.ts`：Worker 入口、MCP 工具注册、资源输出。
  - `prompt.ts`：工具描述与文案模板（`toolDescriptions` / `contentRsp`）。
  - `PokerDO.ts`：Durable Object 持久化牌局状态。
- `src/components/`：UI 组件（`Button` 等）。
- `src/lib/`：通用工具函数。
- `dist/`：Vite 构建产物（自动生成，勿手改；Worker 静态资源绑定目录是 `dist/client`）。

## 关键实现
- MCP 工具：`poker.tableConfig` / `poker.preflop` / `poker.afterflop` / `poker.showdown`。
- 资源渲染：Worker 通过 `ASSETS` 读取构建后的 HTML，并注入 `__WIDGET_DEFAULT__` 用于切换 `start/table` 视图。
- 牌局状态：Durable Object 存储与读取（`PokerDO`）。
- 前端展示：通过 `window.openai` 的 `toolResponseMetadata` 实时渲染牌桌。

## 开发与调试
```bash
npm install     # 安装依赖
npm run dev     # 前端开发服务器（Vite）
npm run build   # 生成 dist/
npm run preview # 本地预览构建产物
npm run lint    # 代码检查
npm run check   # tsc + build + wrangler dry-run
```

> 本地调试 Worker 可手动执行：`npx wrangler dev --config wrangler.json`

## 部署与环境
- **生产环境 (poker-game)**：自定义域名 `poker-api.jiqiren.ai`。命令：`npm run build && wrangler deploy`（或 `npm run deploy`）。不要加 `--env develop`，以免影响测试域。
- **测试环境 (poker-game-develop)**：`workers_dev` 域名。命令：`npm run build && wrangler deploy --env develop --config wrangler.json`。
- **避免抢占生产域名**：`routes` 仅配置在顶层（生产使用）；测试环境在 `env.develop` 中配置 `routes: []`。
- **环境提示**：前端用 `VITE_STAGE` 控制 `(dev)` 标签；测试构建可设置 `VITE_STAGE=develop`，生产设置 `VITE_STAGE=production`。

## 注意事项
- 不要提交密钥；生产配置用 Wrangler secrets 管理。
- Worker 文本/提示词请在 `src/worker/prompt.ts` 维护，避免散落在业务逻辑里。
- 当前仓库没有单独的 `test/` 目录；如需测试，可自行补充 Vitest 用例。
