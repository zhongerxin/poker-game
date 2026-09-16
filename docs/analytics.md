# poker-game 服务端 GA4

2026-09-11 新增 [PostHog 同时上报](./posthog.md)。两个平台独立确认与重试，原有 GA4 统计口径保留。

- 账号：Twox Studio / 268077887
- 媒体资源：poker-game / 553523527，报告时区 Asia/Shanghai
- Web 数据流：poker-game / 15750855572
- Measurement ID：G-PTX586TCF1
- 服务端域名：https://poker-api.jiqiren.ai
- 管理入口：https://analytics.google.com/analytics/web/?hl=zh-cn#/a268077887p553523527/admin

## 统计口径

| 需求 | 事件 / 查看方式 |
| --- | --- |
| 每日 DAU | 按日期查看 `poker_activity` 的总用户数；筛选 `identity_source=openai_subject`。不是事件数，也不是手牌数。 |
| 每天玩几局 | `poker_hand_started` 事件数。完成局数另看 `poker_hand_completed`。按日期和 GA4 用户探索查看单用户记录。 |
| 选择的筹码 | `poker_chips_selected` 的 `chip_stack`，在首次实际开牌时确认选择；支持界面选筹码和直接对话设定。 |
| 进行到什么阶段 | `poker_stage_reached` 的 `stage`：preflop / flop / turn / river / showdown。完成事件的 `final_stage` 保存结束前阶段。 |
| 疑似异常断连 | `poker_hand_interrupted`：未结束的手牌连续 30 分钟没有成功的状态保存，`reason=inactivity_timeout`、`disconnect_confirmed=0`。 |
| 中断后恢复 | `poker_hand_resumed`；恢复不会再计作一手新牌。 |
| 谁赢了 | `poker_hand_completed` 的 `winner`：hero（用户）、ai、tie。`end_reason`：fold / showdown。 |

`table_id` 跨多手牌复用；每次合法 preflop 生成新的 `hand_id`，`hand_number` 在牌桌内递增。
`chip_stack` 保存最初选择的档位，`starting_stack` 是当前这一手开局前的实际筹码，不会把输赢后的余额误当成重新选择的档位。

MCP 是请求响应协议，不存在持续在线连接。用户关闭 ChatGPT、切换页面、主动暂停、模型长时间思考和真实断网，都可能表现为同样的无请求状态；超时只能表示疑似中断。没有服务端请求的纯聊天活动也无法计入活跃。计时以服务端状态保存为准，不代表实际思考/在线时长。

## 用户标识和数据范围

对 `_meta['openai/subject']` 做 SHA-256（加项目命名空间），取 96 位转换为 GA4 要求的“数字.数字”格式后用作 client_id / user_id，不发送原始标识、姓名、邮箱、IP、聊天内容或底牌。这是分析用匿名标识，不能用作鉴权。跨设备去重能力取决于宿主提供的标识是否一致。

缺少 subject 的客户端退化为牌桌标识，`identity_source=table_fallback`，不设置 user_id。这部分只能统计牌桌/手牌，必须从真实 DAU 的筛选中排除。当前没有账户登录体系，不能声称这部分是去重真人用户。

`poker_activity` 附带 `engagement_time_msec=1`，用于标记发生了服务端操作，**不代表实际停留时长**。超时和重试不会产生该活动事件，避免定时任务制造活跃用户。

## 可靠性

状态保存、分析事件入队、闹钟设置在同一个 Durable Object 存储事务中完成。revision 乐观锁拒绝并发过期写入，避免同一状态变化被重复计数；已发阶段、已结算手牌不会再生成相同转换事件。

GA4 在闹钟中发送，不阻塞 MCP 对局。网络错误和非 2xx 响应指数退避重试，事件时间保持原值。超过 71 小时无法成功发送会记录 `ga4_delivery_expired` 并清理，因为 GA4 的回溯窗口有限。缺失密钥会保留队列并重试。

交付语义为 **至少一次**：GA4 已接受请求但响应丢失、或发送成功后存储删除失败，仍可能重复。`event_id` 用于排查/导出去重，GA4 不保证对任意自定义事件按此字段自动去重。HTTP 204 只证明端点接受请求，不能代替调试校验和实际报表入站验证。

## 配置和发布

生产 vars 在 wrangler.json；develop 环境关闭 GA4。密钥只能使用 Cloudflare Worker Secret：

```sh
npx wrangler secret put GA4_API_SECRET --env=""
npm test
npx tsc -b
npm run build
npx wrangler deploy --env=""
```

本地复制 `.dev.vars.example` 为 `.dev.vars`。Vite 可能生成 Wrangler 配置重定向，直接运行 wrangler dev 时要核对输出的环境变量；本地用 `.dev.vars` 显式禁用，避免误向生产流发测试事件。

## GA4 报表建议

在“探索 → 自由形式”中添加日期、事件名称、阶段、筹码档位、赢家、结束原因、标识来源；指标使用总用户数、事件数、每位用户的事件数。

- DAU：筛选 poker_activity + openai_subject，行按日期、值选总用户数。
- 每日对局：筛选 poker_hand_started，行按日期、值选事件数和每位用户的事件数。
- 阶段/胜负：筛选对应事件，按 stage / winner / end_reason 分组。
- 逐局排查：用户探索中检查 table_id、hand_id、hand_number、winner；大规模精确逐局统计适合后续启用 BigQuery 导出。避免把高基数用户 ID 注册成自定义维度。

新自定义维度不回填创建前的数据；标准报表可能需要 24–48 小时处理。可先通过实时报告/DebugView 和 Measurement Protocol 调试端点验证。

参考：
- https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events
- https://developers.cloudflare.com/durable-objects/api/alarms/
- https://developers.openai.com/plugins/reference

## 本次配置状态（2026-09-10）

已在 GA4 保存 7 个事件级自定义维度：牌局阶段 stage、结束前阶段 final_stage、筹码档位 chip_stack、赢家 winner、结束原因 end_reason、标识来源 identity_source、中断原因 reason。

代码已通过 9 项 Vitest 测试、TypeScript 项目检查、Vite 构建和部署 dry-run。本地 Workers 运行时实测 MCP 连续两手牌：完整发到河牌并摊牌、翻牌前 AI 弃牌；重复 preflop 被拒绝，重复发牌/摊牌不重复发牌或扣筹码。

已完成用户数据收集确认；创建 poker-game-server Measurement Protocol 密钥并写入生产 Worker Secret GA4_API_SECRET。密钥未写入代码或前端。

2026-09-10 已部署到生产域名，版本 `7519d0c6-25a6-4361-a5d8-f487a6f3ef76`。8 类事件经 Measurement Protocol 调试端点 ENFORCE_RECOMMENDATIONS 校验，返回空 validationMessages。

生产 MCP 验收使用已连接的 poker-game 工具完成一手 500 筹码牌局，依次到达 flop/turn/river/showdown，winner=hero。GA4 实时报告已出现 poker_activity、poker_table_created、poker_chips_selected、poker_hand_started、poker_stage_reached、poker_hand_completed，并确认 identity_source=openai_subject。实时事件明细已核对到验收 hand_id，以及 winner 参数的 hero / ai 值。

这手验收数据已计入当天数据：table_id=`2c223057-fecc-465b-887b-8e307e9247a9`，hand_id=`13573580-489d-449f-9657-21dbd96113a4`。分析首日数据时可排除此测试手牌。超时和恢复逻辑已通过本地测试，尚未等待真实生产牌局发生 30 分钟超时。

实时报告：https://analytics.google.com/analytics/web/?hl=zh-cn#/a268077887p553523527/realtime/overview
