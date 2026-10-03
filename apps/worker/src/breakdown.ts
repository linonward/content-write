import type { BreakdownResult } from "@content-write/db/schema";
import { z } from "zod";
import { COPY_RUN_CHARS, sharedRun } from "./reference-copy";

const MAX_QUOTE_CHARS = 120;
const text = (max: number) => z.string().trim().min(1).max(max);
const spanIds = z.array(text(40)).max(6);
const move = z.strictObject({
  type: text(60),
  technique: text(300),
  spanIds,
});

/** Mirrors product 8.9. Strict objects reject any extra field such as a rewritten body. */
export const breakdownSchema = z.strictObject({
  titlePattern: text(120),
  audience: text(200),
  hook: move,
  slots: z
    .array(
      z.strictObject({
        id: text(40),
        name: text(60),
        purpose: text(300),
        technique: text(300),
        spanIds,
      }),
    )
    .min(3)
    .max(10),
  rhythm: text(300),
  ending: move,
  whyItWorks: z.array(text(300)).min(1).max(6),
  limitations: z.array(text(300)).min(1).max(6),
  spans: z
    .array(
      z.strictObject({
        id: text(40),
        quote: z.string().min(1).max(MAX_QUOTE_CHARS),
        start: z.int().nonnegative(),
        end: z.int().positive(),
      }),
    )
    // Without spans the author cannot check the structure against the original.
    .min(1)
    .max(30),
});

/**
 * First descriptive field that copies a run of the original verbatim, with the
 * copied run. Descriptions must describe, not reproduce: they go on to guide the
 * author's own article, so they are held to the same limit as generated text.
 */
export function copiedField(content: string, result: BreakdownResult) {
  const fields: [string, string][] = [
    ["titlePattern", result.titlePattern],
    ["audience", result.audience],
    ["hook", `${result.hook.type}\n${result.hook.technique}`],
    ["rhythm", result.rhythm],
    ["ending", `${result.ending.type}\n${result.ending.technique}`],
    ...result.slots.map((slot, index): [string, string] => [
      `slots[${index}]`,
      `${slot.name}\n${slot.purpose}\n${slot.technique}`,
    ]),
    ...result.whyItWorks.map((item, index): [string, string] => [
      `whyItWorks[${index}]`,
      item,
    ]),
    ...result.limitations.map((item, index): [string, string] => [
      `limitations[${index}]`,
      item,
    ]),
  ];
  for (const [name, value] of fields) {
    // Each line is checked on its own so joined fields cannot form a false run.
    const run = sharedRun([content], value.split("\n"), COPY_RUN_CHARS);
    if (run) return { name, run };
  }
  return null;
}

export function validateBreakdown(content: string, input: unknown) {
  const parsed = breakdownSchema.safeParse(input);
  if (!parsed.success) return parsed;
  const data = parsed.data;
  const ids = new Set(data.spans.map((span) => span.id));
  const slotIds = new Set(data.slots.map((slot) => slot.id));
  const cited = [
    data.hook.spanIds,
    data.ending.spanIds,
    ...data.slots.map((slot) => slot.spanIds),
  ].flat();
  if (
    ids.size !== data.spans.length ||
    slotIds.size !== data.slots.length ||
    data.spans.some(
      (span) =>
        span.end <= span.start ||
        content.slice(span.start, span.end) !== span.quote,
    ) ||
    cited.some((id) => !ids.has(id))
  )
    return {
      success: false as const,
      error: new Error("拆解片段与原文不一致或引用了不存在的片段"),
    };
  const copied = copiedField(content, data);
  if (copied)
    return {
      success: false as const,
      error: new Error(
        // Sent back to the model for its one repair; failure logs never include it.
        `${copied.name} 复制了原文「${copied.run}」；描述字段只用自己的话写结构与写法，不要引用原文句子，原文只能放在 spans 中`,
      ),
    };
  return { success: true as const, data: data as BreakdownResult };
}

/**
 * The model copies quotes but cannot count UTF-16 offsets, so positions are
 * located here. Quotes that are not verbatim are dropped and their references
 * removed; a structure without evidence is still useful to the author.
 */
export function locateBreakdown(content: string, value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const raw = value as {
    spans?: { id?: unknown; quote?: unknown }[];
    hook?: { spanIds?: unknown };
    ending?: { spanIds?: unknown };
    slots?: { spanIds?: unknown }[];
    whyItWorks?: unknown;
    limitations?: unknown;
  };
  const spans = (Array.isArray(raw.spans) ? raw.spans : [])
    .map((span) => {
      if (typeof span?.id !== "string" || typeof span.quote !== "string")
        return null;
      const quote = span.quote.trim();
      const start = quote ? content.indexOf(quote) : -1;
      return start < 0
        ? null
        : { id: span.id, quote, start, end: start + quote.length };
    })
    .filter((span) => span !== null)
    .slice(0, 30);
  const ids = new Set(spans.map((span) => span.id));
  // Extra list items are trimmed rather than failing the whole breakdown.
  const firstSix = (items: unknown) =>
    Array.isArray(items) ? items.slice(0, 6) : items;
  const keep = <T extends { spanIds?: unknown }>(part: T | undefined) =>
    part && typeof part === "object"
      ? {
          ...part,
          spanIds: (Array.isArray(part.spanIds) ? part.spanIds : [])
            .filter((id): id is string => typeof id === "string" && ids.has(id))
            .slice(0, 6),
        }
      : part;
  return {
    ...value,
    spans,
    hook: keep(raw.hook),
    ending: keep(raw.ending),
    slots: Array.isArray(raw.slots) ? raw.slots.map(keep) : raw.slots,
    whyItWorks: firstSix(raw.whyItWorks),
    limitations: firstSix(raw.limitations),
  };
}

/** Paragraphs with their offsets in the original text. */
function paragraphs(content: string) {
  const found: { start: number; text: string }[] = [];
  const pattern = /[^\n]+/g;
  for (const match of content.matchAll(pattern)) {
    const value = match[0].trim();
    if (value)
      found.push({ start: match.index + match[0].indexOf(value), text: value });
  }
  return found;
}

// Deterministic development adapter: positions come from the text, labels are generic.
export function createMockBreakdown(content: string): BreakdownResult {
  const parts = paragraphs(content);
  const spans = parts.slice(0, 30).map((part, index) => {
    const end = part.text.search(/[。！？.!?]/);
    const quote = part.text.slice(
      0,
      Math.min(end >= 0 ? end + 1 : part.text.length, MAX_QUOTE_CHARS),
    );
    return {
      id: `s${index + 1}`,
      quote,
      start: part.start,
      end: part.start + quote.length,
    };
  });
  const slotCount = Math.min(Math.max(spans.length, 3), 10);
  const names = ["开头", "展开", "转折", "论证", "案例", "收束"];
  return {
    titlePattern: "mock：按标题结构归类",
    audience: "mock：根据正文推断目标读者",
    hook: {
      type: "mock 开头",
      technique: "用第一段建立问题。",
      spanIds: spans.slice(0, 1).map((span) => span.id),
    },
    slots: Array.from({ length: slotCount }, (_, index) => ({
      id: `slot${index + 1}`,
      name: `${names[index % names.length]}槽位 ${index + 1}`,
      purpose: "mock：说明这一段在全文中的作用。",
      technique: "mock：说明这一段使用的写法。",
      spanIds: spans[index] ? [spans[index].id] : [],
    })),
    rhythm: "mock：按段落数量描述节奏。",
    ending: {
      type: "mock 结尾",
      technique: "用最后一段收束。",
      spanIds: spans.slice(-1).map((span) => span.id),
    },
    whyItWorks: ["mock 结果，不代表真实分析。"],
    limitations: ["mock 结果，不代表真实分析。"],
    spans,
  };
}
