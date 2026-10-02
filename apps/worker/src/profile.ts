import {
  type AuthorProfile,
  profileIsEmpty,
} from "@content-write/db/author-profile";
import type { ChatMessage, ParseResult } from "./ai/deepseek";

const PROFILE_RULES = `
作者设置：
- 作者设置是作者对自己和写法的描述，用来把握视角、选题方向和语气，不是事实来源。不要把简介里的内容当作经历、数据或案例写出来；事实仍只来自素材。
- 素材是作者本人的记录：素材里第一人称的经历就是作者的经历，照常用“我”来写，不要改成“素材作者”“有人”等第三方说法。
- 优先级：本次 brief 与大纲 > 作者设置。两者冲突时按 brief 与大纲。
- 按表达偏好写；不得使用任何禁用词，也不要用它们的变体绕开。`;

function describe(profile: AuthorProfile) {
  return [
    profile.bio && `作者简介：${profile.bio}`,
    profile.topics.length && `写作主题：${profile.topics.join("、")}`,
    profile.audience && `目标读者：${profile.audience}`,
    profile.preferences && `表达偏好：${profile.preferences}`,
    profile.bannedWords.length && `禁用词：${profile.bannedWords.join("、")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Adds the author's profile to a prompt; an empty profile changes nothing. */
export function withProfile(
  messages: ChatMessage[],
  profile: AuthorProfile | null,
): ChatMessage[] {
  if (!profile || profileIsEmpty(profile)) return messages;
  return messages.map((message) =>
    message.role === "system"
      ? { ...message, content: `${message.content}\n${PROFILE_RULES}` }
      : message.role === "user"
        ? {
            ...message,
            content: `${message.content}\n\n<作者设置>\n${describe(profile)}\n</作者设置>`,
          }
        : message,
  );
}

/** Banned words that appear in any of the texts, case-insensitively. */
export function bannedWordsUsed(texts: string[], words: string[]) {
  const joined = texts.join("\n").toLowerCase();
  return words.filter((word) => joined.includes(word.toLowerCase()));
}

/**
 * Wraps a model-output parser so text using the author's banned words counts
 * as a structural error and goes through the single repair.
 */
export function avoidingBannedWords<T>(
  parse: (value: unknown) => ParseResult<T>,
  profile: AuthorProfile | null,
  texts: (data: T) => string[],
) {
  return (value: unknown): ParseResult<T> => {
    const parsed = parse(value);
    if (!parsed.success || !profile?.bannedWords.length) return parsed;
    const used = bannedWordsUsed(texts(parsed.data), profile.bannedWords);
    return used.length
      ? {
          success: false,
          error: `使用了作者的禁用词：${used.join("、")}，请换一种说法`,
        }
      : parsed;
  };
}
