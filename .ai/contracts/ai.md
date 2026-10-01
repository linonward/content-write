# AI 契约

模型输出结构、来源校验、记忆和成本规则见 `docs/product.md` 第 8 节。T001 不调用模型。T006 素材整理以确定性 mock 复制来源首段和片段；对结果实施 Zod 结构校验、证据 ID 校验以及 `content.slice(start,end) === quote` 校验，位置按 JavaScript UTF-16 计算。mock 标志随结果返回，token 用量与成本保持 null，不计入真实模型指标。真实 Provider 原计划在 T021 接入，2026-10-02 起由 T028 取代；接入前非 mock 模式返回 503。

T010 初稿以确定性 mock 生成：按已确认大纲的小节排列目的、要点和引用片段原文，标出每节待补证据，不新增事实。输出经 Zod 校验（标题 ≤200、Markdown ≤50,000 字符、来源映射 ≤60 条、待补证据 ≤30 条），来源映射的素材 ID、素材版本和片段 ID 必须属于文章绑定的来源。mock 不保证达到 1,200～2,000 字目标；token 与费用为 null。

2026-10-02 规划（尚未实现，实现时按任务补充本节）：

- T028 接入 DeepSeek 官方 OpenAI 格式接口，默认 `deepseek-flash`。实测：思考模式默认开启并消耗 `max_tokens`，额度不足时返回空正文与 `finish_reason=length`；`thinking: {type: "disabled"}` 与 `reasoning_effort: "low"` 均可返回合法 JSON。按任务类型设置思考与包含思考预算的 `max_tokens`；空正文或截断视为结构错误修复 1 次。真实结果与 mock 分开标识，CI 只使用 mock。
- T029 拆解输出见 `docs/product.md` 8.9：只输出结构与方法及原文片段位置，片段校验 `content.slice(start,end) === quote`；不输出改写正文，不预测阅读量。
- T030 按框架生成的大纲每节带 `slotId`，证据只能来自文章绑定的自己的素材；参考文章及其片段 ID 在服务端来源校验中拒绝。
