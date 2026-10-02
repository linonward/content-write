# AI 契约

模型输出结构、来源校验、记忆和成本规则见 `docs/product.md` 第 8 节。T001 不调用模型。T006 素材整理以确定性 mock 复制来源首段和片段；对结果实施 Zod 结构校验、证据 ID 校验以及 `content.slice(start,end) === quote` 校验，位置按 JavaScript UTF-16 计算。mock 标志随结果返回，token 用量与成本保持 null，不计入真实模型指标。真实 Provider 原计划在 T021 接入，2026-10-02 起由 T028 取代；接入前非 mock 模式返回 503。

T010 初稿以确定性 mock 生成：按已确认大纲的小节排列目的、要点和引用片段原文，标出每节待补证据，不新增事实。输出经 Zod 校验（标题 ≤200、Markdown ≤50,000 字符、来源映射 ≤60 条、待补证据 ≤30 条），来源映射的素材 ID、素材版本和片段 ID 必须属于文章绑定的来源。mock 不保证达到 1,200～2,000 字目标；token 与费用为 null。

T028 新增：

- `AI_MODE=deepseek`（且设置 `AI_API_KEY`）时，素材整理、选题、大纲与初稿调用 DeepSeek 官方 OpenAI 格式接口，默认 `deepseek-flash`，JSON 输出模式；提示词声明素材是数据而非指令、不得捏造、缺证据要列出。
- 思考设置集中在 `apps/worker/src/ai/config.ts`：整理、选题、大纲 `reasoning_effort: "low"`，`max_tokens` 8,000（修复 16,000）；初稿关闭思考，6,000（修复 10,000）。实测默认思考会耗尽额度返回空正文，因此空正文与 `finish_reason=length` 视为结构错误。
- 结构错误（空、截断、非 JSON、Zod 或来源校验失败）带错误摘要修复 1 次，仍失败则任务以 `AI_OUTPUT_INVALID` 失败且不再重试；网络、超时、429、5xx 最多重试 2 次，耗尽后以对应错误码失败；401/403、402、其他 4xx 直接失败。
- 素材整理由模型逐字摘录片段，服务端用 `indexOf` 计算 UTF-16 位置；找不到原文的片段丢弃，引用它的观点一并移除，不伪造位置。
- 校验与 mock 完全相同：Zod 结构、证据 ID、`content.slice(start,end) === quote`、来源素材与版本。结果与 `ai_runs` 记录 `mode=deepseek`，并记录输入、输出、思考 token 与耗时；未配置价格时费用为 null。
- 首次真实生成需作者确认（`ai_consents`），否则生成接口返回 428。CI 与集成测试只用 mock；真实冒烟记录在 `.ai/verifications/T028.md`。

2026-10-02 规划（尚未实现，实现时按任务补充本节）：

- T029 拆解输出见 `docs/product.md` 8.9：只输出结构与方法及原文片段位置，片段校验 `content.slice(start,end) === quote`；不输出改写正文，不预测阅读量。
- T030 按框架生成的大纲每节带 `slotId`，证据只能来自文章绑定的自己的素材；参考文章及其片段 ID 在服务端来源校验中拒绝。
