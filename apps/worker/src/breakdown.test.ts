import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeepSeekDeps } from "./ai/deepseek";
import { generateBreakdown } from "./ai/generate";
import {
  createMockBreakdown,
  locateBreakdown,
  validateBreakdown,
} from "./breakdown";

const content = [
  "30 岁那年，我从大厂辞职，以为终于自由了。",
  "结果第三个月，我连早上几点起床都决定不了。",
  "后来我才明白，自由不是没人管，而是每件小事都得自己定规则。",
  "你呢？你给自己定过什么规则？",
].join("\n\n");

/** A model-shaped answer: quotes without offsets. */
function answer(overrides: Record<string, unknown> = {}) {
  return {
    titlePattern: "年龄节点 + 认知转变",
    audience: "想辞职或刚辞职的职场人",
    hook: {
      type: "预期反转",
      technique: "先给出普遍期待，再立刻打破。",
      spanIds: ["s1"],
    },
    slots: [
      {
        id: "slot1",
        name: "开头：期待",
        purpose: "建立预期",
        technique: "一句话交代背景",
        spanIds: ["s1"],
      },
      {
        id: "slot2",
        name: "转折：失控",
        purpose: "制造反差",
        technique: "用具体细节代替抽象判断",
        spanIds: ["s2"],
      },
      {
        id: "slot3",
        name: "领悟",
        purpose: "给出观点",
        technique: "观点句收束",
        spanIds: ["s3"],
      },
    ],
    rhythm: "短段落，每段一个转折。",
    ending: {
      type: "留白提问",
      technique: "把问题抛给读者。",
      spanIds: ["s4"],
    },
    whyItWorks: ["反差让人想读下去。"],
    limitations: ["依赖作者真实经历。"],
    spans: [
      { id: "s1", quote: "以为终于自由了。" },
      { id: "s2", quote: "我连早上几点起床都决定不了" },
      { id: "s3", quote: "自由不是没人管" },
      { id: "s4", quote: "你给自己定过什么规则？" },
    ],
    ...overrides,
  };
}

describe("breakdown validation", () => {
  it("locates verbatim quotes and accepts a structure-only result", () => {
    const checked = validateBreakdown(
      content,
      locateBreakdown(content, answer()),
    );
    expect(checked.success).toBe(true);
    if (!checked.success) return;
    for (const span of checked.data.spans)
      expect(content.slice(span.start, span.end)).toBe(span.quote);
  });

  it("drops invented quotes and the references to them", () => {
    const located = locateBreakdown(
      content,
      answer({
        spans: [
          { id: "s1", quote: "以为终于自由了。" },
          { id: "s2", quote: "原文里没有这句话" },
        ],
      }),
    );
    const checked = validateBreakdown(content, located);
    expect(checked.success).toBe(true);
    if (!checked.success) return;
    expect(checked.data.spans.map((span) => span.id)).toEqual(["s1"]);
    expect(checked.data.slots[1].spanIds).toEqual([]);
    expect(checked.data.ending.spanIds).toEqual([]);
  });

  it("trims lists past their limit instead of failing", () => {
    const long = answer({
      whyItWorks: Array.from({ length: 9 }, (_, i) => `原因 ${i}`),
      limitations: Array.from({ length: 8 }, (_, i) => `局限 ${i}`),
    });
    const checked = validateBreakdown(content, locateBreakdown(content, long));
    expect(checked.success).toBe(true);
    if (!checked.success) return;
    expect(checked.data.whyItWorks).toHaveLength(6);
    expect(checked.data.limitations).toHaveLength(6);
  });

  it("rejects descriptive fields that copy the original text", () => {
    const copied = answer({
      slots: [
        ...answer().slots.slice(0, 2),
        {
          id: "slot3",
          name: "领悟",
          purpose: "后来我才明白，自由不是没人管，而是每件小事都得自己定规则。",
          technique: "观点句",
          spanIds: [],
        },
      ],
    });
    const checked = validateBreakdown(
      content,
      locateBreakdown(content, copied),
    );
    expect(checked.success).toBe(false);
  });

  it("rejects extra output such as a rewritten body", () => {
    const checked = validateBreakdown(
      content,
      locateBreakdown(content, answer({ rewrite: "改写后的全文……" })),
    );
    expect(checked.success).toBe(false);
  });

  it("requires 3 to 10 slots and positions that match the original", () => {
    const tooFew = answer({ slots: answer().slots.slice(0, 2) });
    expect(
      validateBreakdown(content, locateBreakdown(content, tooFew)).success,
    ).toBe(false);
    const located = locateBreakdown(content, answer()) as {
      spans: { start: number }[];
    };
    located.spans[0].start += 1;
    expect(validateBreakdown(content, located).success).toBe(false);
  });

  it("requires spans so the author can check the original", () => {
    const { spans: _spans, ...withoutSpans } = answer();
    expect(
      validateBreakdown(content, locateBreakdown(content, withoutSpans))
        .success,
    ).toBe(false);
    const invented = answer({ spans: [{ id: "s1", quote: "原文里没有" }] });
    expect(
      validateBreakdown(content, locateBreakdown(content, invented)).success,
    ).toBe(false);
  });

  it("rejects references to spans that do not exist", () => {
    const located = locateBreakdown(content, answer()) as {
      hook: { spanIds: string[] };
    };
    located.hook.spanIds = ["s99"];
    expect(validateBreakdown(content, located).success).toBe(false);
  });

  it("mock output passes the same validation", () => {
    const checked = validateBreakdown(content, createMockBreakdown(content));
    expect(checked.success).toBe(true);
    expect(validateBreakdown("短文", createMockBreakdown("短文")).success).toBe(
      true,
    );
  });
});

describe("breakdown generation in deepseek mode", () => {
  const prior = { ...process.env };
  beforeEach(() => {
    process.env.AI_MODE = "deepseek";
    process.env.AI_API_KEY = "test-key";
  });
  afterEach(() => {
    process.env = { ...prior };
  });

  it("repairs a copying answer once, then returns the valid one", async () => {
    const replies = [
      answer({ rhythm: "结果第三个月，我连早上几点起床都决定不了。" }),
      answer(),
    ];
    const bodies: { messages: { content: string }[] }[] = [];
    const deps: DeepSeekDeps = {
      apiKey: "test-key",
      baseUrl: "https://example.invalid",
      model: "deepseek-flash",
      timeoutMs: 1_000,
      sleep: async () => undefined,
      fetch: (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: JSON.stringify(replies.shift()) },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    };
    const result = await generateBreakdown("辞职三个月", content, deps);
    expect(result.meta).toMatchObject({ mode: "deepseek" });
    expect(result.output.slots).toHaveLength(3);
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[0].messages)).toContain("<标题>\\n辞职三个月");
    expect(JSON.stringify(bodies[1].messages)).toContain("复制了原文");
  });
});
