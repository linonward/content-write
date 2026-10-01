import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TerminalJobError } from "../failures";
import { type DeepSeekDeps, generateJson, type ParseResult } from "./deepseek";
import { generateAnalysis, locateAnalysis } from "./generate";

type Reply =
  | { status: number; content?: string; finish?: string; reasoning?: number }
  | { throws: string };

function stub(replies: Reply[]) {
  const bodies: Record<string, unknown>[] = [];
  const sleeps: number[] = [];
  const deps: DeepSeekDeps = {
    apiKey: "test-key",
    baseUrl: "https://example.invalid",
    model: "deepseek-flash",
    timeoutMs: 1_000,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetch: (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      const reply = replies.shift();
      if (!reply) throw new Error("unexpected call");
      if ("throws" in reply) {
        const error = new Error(reply.throws);
        error.name = reply.throws;
        throw error;
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: reply.content ?? "" },
              finish_reason: reply.finish ?? "stop",
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            completion_tokens_details: {
              reasoning_tokens: reply.reasoning ?? 0,
            },
          },
        }),
        { status: reply.status },
      );
    }) as typeof fetch,
  };
  return { deps, bodies, sleeps };
}

const parseCount = (value: unknown): ParseResult<number> => {
  const count = (value as { count?: unknown } | null)?.count;
  return typeof count === "number"
    ? { success: true, data: count }
    : { success: false, error: "缺少 count" };
};
const messages = [{ role: "user" as const, content: "json" }];

async function terminalCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TerminalJobError) return error.code;
    throw error;
  }
  throw new Error("expected a terminal error");
}

describe("DeepSeek adapter", () => {
  it("sends JSON mode with the kind's thinking setting and records usage", async () => {
    const { deps, bodies } = stub([
      { status: 200, content: '{"count":3}', reasoning: 20 },
    ]);
    const result = await generateJson(
      "idea_generation",
      messages,
      parseCount,
      deps,
    );
    expect(result.data).toBe(3);
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 20,
      calls: 1,
    });
    expect(bodies[0]).toMatchObject({
      model: "deepseek-flash",
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      max_tokens: 8_000,
    });
  });

  it("disables thinking for drafts", async () => {
    const { deps, bodies } = stub([{ status: 200, content: '{"count":1}' }]);
    await generateJson("draft_generation", messages, parseCount, deps);
    expect(bodies[0]).toMatchObject({ thinking: { type: "disabled" } });
    expect(bodies[0]).not.toHaveProperty("reasoning_effort");
  });

  it("repairs empty content once with a larger budget", async () => {
    const { deps, bodies } = stub([
      { status: 200, content: "" },
      { status: 200, content: '{"count":2}' },
    ]);
    const result = await generateJson(
      "outline_generation",
      messages,
      parseCount,
      deps,
    );
    expect(result.data).toBe(2);
    expect(result.usage.calls).toBe(2);
    expect(bodies[1]).toMatchObject({ max_tokens: 16_000 });
  });

  it("treats truncated output as a structural error and repairs it", async () => {
    const { deps } = stub([
      { status: 200, content: '{"count":', finish: "length" },
      { status: 200, content: '{"count":4}' },
    ]);
    const result = await generateJson(
      "material_analysis",
      messages,
      parseCount,
      deps,
    );
    expect(result.data).toBe(4);
  });

  it("fails without further calls when the repaired output is still invalid", async () => {
    const { deps, bodies } = stub([
      { status: 200, content: '{"wrong":1}' },
      { status: 200, content: "not json" },
    ]);
    expect(
      await terminalCode(
        generateJson("idea_generation", messages, parseCount, deps),
      ),
    ).toBe("AI_OUTPUT_INVALID");
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1].messages)).toContain("缺少 count");
  });

  it("does not retry authentication failures", async () => {
    const { deps, bodies } = stub([{ status: 401 }]);
    expect(
      await terminalCode(
        generateJson("idea_generation", messages, parseCount, deps),
      ),
    ).toBe("AI_AUTH_FAILED");
    expect(bodies).toHaveLength(1);
  });

  it("retries rate limits up to twice with backoff", async () => {
    const { deps, bodies, sleeps } = stub([
      { status: 429 },
      { status: 429 },
      { status: 200, content: '{"count":5}' },
    ]);
    const result = await generateJson(
      "idea_generation",
      messages,
      parseCount,
      deps,
    );
    expect(result.data).toBe(5);
    expect(bodies).toHaveLength(3);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("gives up after two retries on timeouts", async () => {
    const { deps, bodies } = stub([
      { throws: "TimeoutError" },
      { throws: "TimeoutError" },
      { throws: "TimeoutError" },
    ]);
    expect(
      await terminalCode(
        generateJson("idea_generation", messages, parseCount, deps),
      ),
    ).toBe("AI_TIMEOUT");
    expect(bodies).toHaveLength(3);
  });
});

describe("analysis positions", () => {
  const content =
    "第一周睡到自然醒。真正拖慢我的不是时间，而是没有固定的开始动作。";

  it("locates verbatim quotes and drops invented ones with their claims", () => {
    const located = locateAnalysis(content, {
      summary: "s",
      tags: [],
      evidenceSpans: [
        { id: "e1", quote: "真正拖慢我的不是时间" },
        { id: "e2", quote: "原文里没有这句话" },
      ],
      claims: [
        { text: "a", kind: "source_claim", evidenceIds: ["e1"] },
        { text: "b", kind: "source_claim", evidenceIds: ["e2"] },
      ],
      angles: [],
    }) as {
      evidenceSpans: { id: string; start: number; end: number }[];
      claims: unknown[];
    };
    expect(located.evidenceSpans).toEqual([
      {
        id: "e1",
        quote: "真正拖慢我的不是时间",
        start: content.indexOf("真正"),
        end: content.indexOf("真正") + 10,
      },
    ]);
    expect(located.claims).toHaveLength(1);
  });

  describe("in deepseek mode", () => {
    const prior = { ...process.env };
    beforeEach(() => {
      process.env.AI_MODE = "deepseek";
      process.env.AI_API_KEY = "test-key";
    });
    afterEach(() => {
      process.env = { ...prior };
    });

    it("returns validated analysis with deepseek mode and usage", async () => {
      const { deps } = stub([
        {
          status: 200,
          content: JSON.stringify({
            summary: "作者发现缺少开始动作。",
            tags: ["写作习惯"],
            evidenceSpans: [{ id: "e1", quote: "没有固定的开始动作" }],
            claims: [
              {
                text: "开始动作很重要",
                kind: "author_opinion",
                evidenceIds: ["e1"],
              },
            ],
            angles: [{ title: "开始动作", rationale: "素材直接说明了原因。" }],
          }),
        },
      ]);
      const result = await generateAnalysis(content, deps);
      expect(result.meta.mode).toBe("deepseek");
      expect(result.meta.usage?.calls).toBe(1);
      expect(result.output.evidenceSpans[0].start).toBe(
        content.indexOf("没有固定"),
      );
    });
  });
});
