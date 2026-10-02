export type AiMode = "mock" | "deepseek" | null;

/** Short label for results and status badges; mock never passes as a real model. */
export function modeLabel(mode: string | null | undefined) {
  if (mode === "deepseek") return "DeepSeek 生成";
  if (mode === "mock") return "mock 生成";
  return "未配置生成服务";
}

/** One sentence telling the author which service produced or will produce results. */
export function modeNote(mode: AiMode) {
  if (mode === "deepseek")
    return "当前使用 DeepSeek 模型生成，结果需要作者核对。";
  if (mode === "mock") return "当前使用确定性 mock，结果不计入真实模型指标。";
  return "当前未配置可用的生成服务。";
}
