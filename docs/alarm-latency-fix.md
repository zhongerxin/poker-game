# DO alarm 延迟修复与上线验收

2026-09-12 19:41:10（Asia/Shanghai）上线生产 `poker-game`，域名 `poker-api.jiqiren.ai`。

- 新版本：`6dab96bd-de6c-4d05-8759-09769f9b537b`，流量 100%。
- 原版本：`57e7765f-b451-4b15-9e97-da98a8c16f7b`。
- 修改前本地构建的 Worker 与线上文件 SHA-256 一致：`9c3a17e69c226a82f8a42e11ad80349b25398b8df112aff60bf82f488be00b2c`。此前未提交的分析功能已经在线上，本次以该版本为基线。
- 本次仅修改生产代码 `src/worker/analytics.ts` 和 `src/worker/PokerDO.ts`；没有更改牌局规则、存储格式、绑定、密钥、前端或 MCP 传输方式。

## 原因与修改

修改前 3 小时的 364 次 alarm 中位耗时 5,043ms，P99 5,759ms，最大 6,055ms；同一窗口没有 `analytics_delivery_retry` / `analytics_delivery_expired` 日志，不能把这些 5 秒调用全部解释成外部平台超时。

原先每次 `AbortSignal.timeout(5000)` 创建的截止定时器，在上报成功后仍保留至到期，延长 DO 调用生命周期。现在使用 `AbortController` 和可清理定时器，在 `finally` 中清理；PostHog 的响应体读取仍在超时保护范围内，GA4 不使用的响应体显式取消。实际网络超时仍保留 5 秒，避免仅通过缩短等待时间造成额外上报失败。

alarm 每轮最多并发发送 4 条记录，避免原先最多 100 条串行网络请求在故障时叠加等待。剩余记录继续保存在 outbox，由下一次 alarm 处理。所有并发任务结束后才处理存储失败或重设 alarm；重设前在事务内重新读取当前 outbox、activity 和牌局，避免覆盖上报期间新写入的调度。

原有平台独立确认、旧 GA4 记录兼容、指数退避、71 小时过期和至少一次交付语义保持。失败、响应丢失或持久化异常仍可能导致重投，不能承诺绝对不丢失或绝对不重复。

真实 workerd/Miniflare 测试中，旧版在外部网络等待期间也能处理并发 `/game` 请求。因此此前“alarm 直接锁住所有请求”的说法没有被复现；本次确认并修复的是残留定时器与过长的串行等待。线上 `/game` 长尾是否长期改善，仍需更多自然流量验证。

## 验证

- 21 项 Vitest 测试全部通过，包含真实 SQLite DO alarm 与并发 GET/POST。
- 定时器清理回归测试对修改前代码运行时，两家平台均失败（各残留 2 个定时器）；对修复代码均通过。
- 覆盖网络卡住、PostHog 响应体卡住、并发数量限制、投递期间新增事件、重复 alarm、平台暂停/缺少密钥、失败重试、对象重建、空闲中断/恢复、过期 revision 拒绝与已完成手牌不再中断。
- `npx tsc -b`、`npm run build`、生产 `wrangler deploy --dry-run`、`git diff --check` 通过；前端资源无需重新上传。
- 生产通过已连接的 poker-game MCP 完成一手完整牌局，并重复调用 showdown；状态相同，双方剩余筹码加底池仍为 1,000。
- 验收牌桌 `0806b491-97a5-4184-975e-ae06ee03155a`，手牌 `d7c5d948-5464-4c79-a7b1-b31a36e6f6e3`。PostHog 查询确认 `poker_hand_completed` 已入站，winner=hero，唯一事件数=1。该验收数据会进入分析平台，分析当天数据时可排除此牌桌。

## 上线后首批日志

截至 2026-09-12 19:45:06，按新版本 ID 过滤；样本量很小，且包含上述验收流量，以下不是长期性能承诺。

| 调用 | 数量 | 中位耗时 | 最大耗时 |
| --- | ---: | ---: | ---: |
| alarm | 7 | 189ms | 709ms |
| GET /game | 11 | 1ms | 24ms |
| POST /game | 8 | 31ms | 268ms |

该窗口未出现分析投递重试/过期日志或 CPU 超限。另有一次既有 `POST /mcp` hung 错误，已按 requestId 查到相同的运行时取消错误原文；MCP 传输问题不在此次修复范围内，不能将它报告为已修复。

本次没有存储迁移。需要回滚时可执行：

```sh
npx wrangler rollback 57e7765f-b451-4b15-9e97-da98a8c16f7b --env=''
```

参考：[DO 并发与输入/输出门](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)、[alarm 的重试语义](https://developers.cloudflare.com/durable-objects/api/alarms/)。
