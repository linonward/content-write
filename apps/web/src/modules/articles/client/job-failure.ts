/**
 * What to tell the author about a failed generation job. Only failures the
 * author can act on get their own message; the rest keep the caller's wording.
 */
export function jobFailureMessage(errorCode: string | null, fallback: string) {
  return errorCode === "REFERENCE_COPIED"
    ? "生成结果里出现了参考文章的原文，这次结果没有保存。请重试；反复出现时，检查大纲或修改要求里是否带着参考文章的句子。"
    : fallback;
}
