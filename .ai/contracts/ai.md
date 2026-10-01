# AI 契约

模型输出结构、来源校验、记忆和成本规则见 `docs/product.md` 第 8 节。T001 不调用模型。T006 素材整理以确定性 mock 复制来源首段和片段；对结果实施 Zod 结构校验、证据 ID 校验以及 `content.slice(start,end) === quote` 校验，位置按 JavaScript UTF-16 计算。mock 标志随结果返回，token 用量与成本保持 null，不计入真实模型指标。真实 Provider 在 T021 接入，非 mock 模式目前返回 503。
