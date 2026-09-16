# PostHog 服务端分析

- 项目：poker-game / 255963（US Cloud，Asia/Shanghai）
- 仪表盘：https://us.posthog.com/project/255963/dashboard/2084238
- 事件入口：`https://us.i.posthog.com/batch/`
- 生产 Worker：`poker-game` / `https://poker-api.jiqiren.ai`
- 生产版本：`57e7765f-b451-4b15-9e97-da98a8c16f7b`（2026-09-11）

## 事件与身份

沿用 [GA4 事件口径](./analytics.md)：`poker_activity`、`poker_table_created`、`poker_chips_selected`、`poker_hand_started`、`poker_stage_reached`、`poker_hand_completed`、`poker_hand_interrupted`、`poker_hand_resumed`。

`distinct_id` 使用现有匿名哈希标识。`identity_source=openai_subject` 才用于真人用户去重；`table_fallback` 是牌桌标识，不建立 person profile，不能计入真人 DAU。不发送原始 subject、底牌、聊天内容或姓名。`$geoip_disable=true` 避免把 Cloudflare 服务器位置当成玩家位置。不安装前端 tag、自动采集或录屏。

`session_id` 是原有服务端自定义属性，不当作 PostHog 原生 `$session_id` 使用。本方案不提供浏览器会话、停留时长或流量来源分析。

## 发送与可靠性

牌局状态和两家平台的发送记录在同一个 Durable Object 事务中保存。GA4 与 PostHog 有独立队列记录、重试计数和确认状态；一家失败不会使另一家重复发送。升级前无 provider 的队列记录仍只投递 GA4，不补发旧数据到 PostHog。

PostHog 事件保留原始时间，并根据 `event_id` 生成稳定 UUID；重试时不重新生成。成功回执接受 PostHog 实际返回的 `{"status":"Ok"}` 和数字状态 `1`。失败指数退避重试，最长每小时一次；超过71小时记录 `analytics_delivery_expired` 并清理。关闭某个平台会停止新事件入队，已有事件保留并退避重试至过期，不静默标为发送成功。

交付为至少一次，PostHog 的底层去重可能有延迟。仪表盘事件数量使用 `uniqExact(uuid)`；手数使用 `hand_id` 去重，避免重试暂时放大指标。

## 配置

生产 `wrangler.json` 启用 `POSTHOG_ENABLED=true`；develop 与本地示例默认关闭。项目 token 存储在 Worker Secret `POSTHOG_PROJECT_TOKEN`，不提交代码，不使用 `VITE_*` 变量。

```sh
npx wrangler secret put POSTHOG_PROJECT_TOKEN --env=""
npm test
npx tsc -b
npm run build
npx wrangler deploy --env="" --dry-run
npx wrangler deploy --env=""
```

## 报表

仪表盘包含 DAU、开局与完成、每日每用户局数、筹码选择、阶段到达、胜负、结束阶段与方式、疑似中断与恢复、身份覆盖检查、逐手牌明细、每日人均开局数。

趋势图默认近30天，可在仪表盘调整日期。三个 SQL 明细报表目前固定近30天，在各报表说明中明确标注。阶段 `showdown` 是结算状态，包含弃牌结算；图表不把它包装为严格的牌局漏斗。`interrupted` 表示30分钟无成功状态保存，不是确认网络断连或自动判负。

## 验收记录

2026-09-11：13项单元测试、TypeScript 检查、生产构建、部署 dry-run 通过；通过已连接的 poker-game MCP 工具在生产完成正常摊牌和双方弃牌测试，并重复调用结算。服务端事件已在 PostHog 活动页和查询 API 中出现。

验收牌桌 `bd7194db-64bd-4501-aac1-c0226605face` 已从 PostHog 运营报表排除，原始活动页仍可查。它也会上报到 GA4，比较首日数据时应同样排除此牌桌。

- 正常摊牌：`c95edc03-9798-4a32-92f7-f6fafac44178`，winner=hero。
- AI 弃牌：`9e869688-fe4a-42d6-8849-50654ea6b070`，winner=hero。
- 成功回执修正后，用户弃牌：`5dce29ea-6c3a-421a-80cd-9f0e10d9ccb5`，winner=ai。
- 另有一个 `poker_analytics_delivery_check` API 回执诊断事件，`is_test=true`，不进入运营报表。

接入初期部分事件因成功回执格式差异产生了重试，已修正；事件 UUID 保持不变，报表按唯一标识去重。真实未完成牌局触发的中断事件也已入站；恢复行为的触发逻辑由本地测试覆盖，不为验收主动改写真实用户牌局。

参考：[Capture API](https://posthog.com/docs/api/capture)、[事件去重](https://posthog.com/docs/data/events)。
