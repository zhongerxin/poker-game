# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript source. Entry in `src/index.ts`, UI in `src/app.tsx` and `src/chess.tsx`, worker logic in `src/mcpWorker.ts`, widget templates in `src/widget/`.
- `test/`: Vitest specs (`index.spec.ts`) and TypeScript test config.
- `dist/`: Vite build output (generated). Avoid manual edits.
- Config: `vite.config.ts`, `vitest.config.mts`, `tsconfig.json`, `wrangler.jsonc`, `worker-configuration.d.ts`.
- Assets: Static HTML fragments in `src/widget/`. Keep names lowercase with hyphens.

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server for the React UI.
- `npm run dev:wrangler`: Run the Cloudflare Worker locally with Wrangler.
- `npm run build`: Create production bundle in `dist/`.
- `npm run deploy`: Build then deploy via Wrangler using `wrangler.jsonc`.
- `npm run types`: Regenerate Worker type definitions.

## Coding Style & Naming Conventions
- Language: TypeScript + JSX. Use ES modules and prefer explicit exports.
- Formatting: Follow existing Vite/React style; use two-space indentation, single quotes in TS/JSX where consistent.
- Components: PascalCase for React components/files (`ChessBoard.tsx` style), camelCase for functions/variables, SCREAMING_SNAKE_CASE for constants.
- HTML templates in `src/widget/`: keep semantic tags, minimal inline styles.

## Testing Guidelines
- Framework: Vitest with Cloudflare Workers pool (`@cloudflare/vitest-pool-workers`).
- Location: Place specs in `test/` with `.spec.ts` suffix; mirror source naming when possible.
- Running: `npm test` is not defined; use `npx vitest` or configure a script if adding tests. Prefer fast, isolated units; avoid network calls.
- Coverage: Add focused assertions for chess logic, widget rendering, and worker handlers; mock external services.

## Commit & Pull Request Guidelines
- Commits: Keep messages in present tense and concise (e.g., `Add chess move validation`). Group related changes per commit.
- Pull Requests: Provide summary, testing notes (`npx vitest` output), and screenshots/GIFs for UI changes. Link related issues and call out risk areas (worker deployment, widget HTML).

## Security & Configuration Tips
- Secrets: Do not commit credentials; use Wrangler secrets for Worker config.
- Builds: Verify `wrangler.jsonc` target before deploying. Check `worker-configuration.d.ts` when adding bindings.

## Agent-Specific Instructions
- 可以用英文思考，但回答时必须使用中文。
- 未明确请求直接改动文件时，不要修改代码；请说明修改步骤并提供可复制的示例片段。
