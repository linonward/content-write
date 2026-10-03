import type { FrameworkSnapshot } from "@content-write/db/framework";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeepSeekDeps } from "./ai/deepseek";
import { generateDraft, generateEdit, generateOutline } from "./ai/generate";
import { createMockDraft, type DraftContext } from "./draft";
import type { EditContext } from "./edit";
import { createMockFrameworkOutline } from "./outline";
import { REFERENCE_COPIED } from "./reference-copy";

const copied = "结果第三个月，我连早上几点起床都决定不了";
const reference = {
  title: "辞职之后我才明白的事",
  content: `30 岁那年，我从大厂辞职，以为终于自由了。\n\n${copied}。`,
};
const brief = {
  workingTitle: "离职后的写作陷阱",
  audience: "刚离职的程序员",
  thesis: "拖慢写作的不是时间，而是缺少固定的开始动作",
};
const source = {
  id: "m1",
  version: 1,
  title: "离职后的第一个月",
  summary: "缺少开始动作。",
  evidenceIds: ["e1"],
  evidence: [{ id: "e1", quote: "真正拖慢我的不是时间" }],
};
const framework: FrameworkSnapshot = {
  name: "预期反转",
  titlePattern: "年龄节点 + 认知转变",
  hook: { type: "预期反转", technique: "先给期待再打破。" },
  slots: ["开头：反常识现象", "转折：代价浮现", "收束：新的规则"].map(
    (name, index) => ({
      id: `slot${index + 1}`,
      name,
      purpose: "这一段的作用",
      technique: "这一段的手法",
    }),
  ),
  rhythm: "短段落。",
  ending: { type: "留白提问", technique: "把问题抛给读者。" },
};
const outline = createMockFrameworkOutline(brief, [source], framework);
const draftContext: DraftContext = { brief, outline, sources: [source] };
const draft = createMockDraft(draftContext);
const editContext: EditContext = {
  scope: "selection",
  instruction: "写得更口语一些",
  selectionText: "我每天早上先整理前一天的笔记。",
  before: "",
  after: "",
  brief,
  sources: [source],
};
const edit = {
  replacement: "每天早上，我先把前一天的笔记理一遍。",
  explanation: "改成更口语的说法。",
  evidenceGaps: [],
};

/** A model that answers with the given replies in turn and records each request. */
function model(replies: unknown[]) {
  const requests: string[] = [];
  const deps: DeepSeekDeps = {
    apiKey: "test-key",
    baseUrl: "https://example.invalid",
    model: "deepseek-flash",
    timeoutMs: 1_000,
    sleep: async () => undefined,
    fetch: (async (_url: string, init: RequestInit) => {
      requests.push(
        JSON.stringify(
          (JSON.parse(String(init.body)) as { messages: unknown }).messages,
        ),
      );
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
  return { deps, requests };
}

const copyingOutline = {
  ...outline,
  sections: outline.sections.map((section, index) =>
    index === 1 ? { ...section, keyPoints: [`先写：${copied}`] } : section,
  ),
};
const copyingDraft = {
  ...draft,
  markdown: `${draft.markdown}\n\n${copied}，这是我的真实感受。`,
};
const copyingEdit = { ...edit, replacement: `${copied}，所以我先整理笔记。` };

describe("generated text against the reference original (deepseek mode)", () => {
  const prior = { ...process.env };
  beforeEach(() => {
    process.env.AI_MODE = "deepseek";
    process.env.AI_API_KEY = "test-key";
  });
  afterEach(() => {
    process.env = { ...prior };
  });

  const outlineWith = (deps: DeepSeekDeps, bound: typeof reference | null) =>
    generateOutline(brief, [source], framework, null, deps, [], [], bound);
  const draftWith = (deps: DeepSeekDeps, bound: typeof reference | null) =>
    generateDraft(draftContext, null, deps, [], [], bound);
  const editWith = (
    deps: DeepSeekDeps,
    bound: typeof reference | null,
    context = editContext,
  ) => generateEdit(context, deps, [], null, [], bound);

  it("repairs an outline that copies the original, without ever sending the original", async () => {
    const { deps, requests } = model([copyingOutline, outline]);
    const result = await outlineWith(deps, reference);
    expect(JSON.stringify(result.output)).not.toContain(copied);
    expect(requests).toHaveLength(2);
    expect(requests[0]).not.toContain("30 岁那年");
    expect(requests[0]).not.toContain(reference.title);
    expect(requests[1]).toContain("框架来源文章的原文");
  });

  it("repairs a draft that copies the original", async () => {
    const { deps, requests } = model([copyingDraft, draft]);
    const result = await draftWith(deps, reference);
    expect(result.output.markdown).not.toContain(copied);
    expect(requests).toHaveLength(2);
  });

  it("repairs an edit that copies the original", async () => {
    const { deps, requests } = model([copyingEdit, edit]);
    const result = await editWith(deps, reference);
    expect(result.output.replacement).not.toContain(copied);
    expect(requests).toHaveLength(2);
  });

  it("fails with its own code when the repair still copies", async () => {
    const attempts: [string, () => Promise<unknown>, { requests: string[] }][] =
      [];
    for (const [name, reply, run] of [
      ["outline", copyingOutline, outlineWith],
      ["draft", copyingDraft, draftWith],
      ["edit", copyingEdit, editWith],
    ] as const) {
      const fake = model([reply, reply]);
      attempts.push([name, () => run(fake.deps, reference), fake]);
    }
    for (const [name, run, fake] of attempts) {
      await expect(run(), name).rejects.toMatchObject({
        code: REFERENCE_COPIED,
      });
      expect(fake.requests, name).toHaveLength(2);
    }
  });

  it("keeps the generic code when the repair fails for another reason", async () => {
    const { deps } = model([copyingDraft, { title: "不完整" }]);
    await expect(draftWith(deps, reference)).rejects.toMatchObject({
      code: "AI_OUTPUT_INVALID",
    });
  });

  it("does not check articles without a bound reference", async () => {
    for (const run of [
      () => outlineWith(model([copyingOutline]).deps, null),
      () => draftWith(model([copyingDraft]).deps, null),
      () => editWith(model([copyingEdit]).deps, null),
    ])
      await expect(run()).resolves.toBeDefined();
  });

  it("lets an edit keep original text the author already had in the selection", async () => {
    const { deps, requests } = model([copyingEdit]);
    const result = await editWith(deps, reference, {
      ...editContext,
      selectionText: `我想起那句话：${copied}。`,
    });
    expect(result.output.replacement).toContain(copied);
    expect(requests).toHaveLength(1);
  });
});

describe("generated text against the reference original (mock mode)", () => {
  const prior = { ...process.env };
  beforeEach(() => {
    process.env.AI_MODE = "mock";
  });
  afterEach(() => {
    process.env = { ...prior };
  });

  it("fails a mock outline whose framework carries the original", async () => {
    const carrying: FrameworkSnapshot = {
      ...framework,
      slots: framework.slots.map((slot, index) =>
        index === 0 ? { ...slot, purpose: `${copied}。` } : slot,
      ),
    };
    await expect(
      generateOutline(
        brief,
        [source],
        carrying,
        null,
        undefined,
        [],
        [],
        reference,
      ),
    ).rejects.toMatchObject({ code: REFERENCE_COPIED });
    await expect(
      generateOutline(brief, [source], carrying),
    ).resolves.toBeDefined();
  });

  it("passes clean mock output for a bound article", async () => {
    await expect(
      generateOutline(
        brief,
        [source],
        framework,
        null,
        undefined,
        [],
        [],
        reference,
      ),
    ).resolves.toBeDefined();
    await expect(
      generateDraft(draftContext, null, undefined, [], [], reference),
    ).resolves.toBeDefined();
    await expect(
      generateEdit(editContext, undefined, [], null, [], reference),
    ).resolves.toBeDefined();
  });
});
