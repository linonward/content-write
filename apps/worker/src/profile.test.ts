import type { AuthorProfile } from "@content-write/db/author-profile";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeepSeekDeps } from "./ai/deepseek";
import { generateDraft } from "./ai/generate";
import { draftMessages } from "./ai/prompts";
import { createMockDraft, type DraftContext } from "./draft";
import { bannedWordsUsed, withProfile } from "./profile";

const profile: AuthorProfile = {
  bio: "前后端都写过的独立开发者",
  topics: ["写作习惯", "小团队协作"],
  audience: "工作 3 到 8 年的程序员",
  preferences: "短句，先给结论",
  bannedWords: ["赋能", "闭环"],
};
const empty: AuthorProfile = {
  bio: "",
  topics: [],
  audience: "",
  preferences: "",
  bannedWords: [],
};
const context: DraftContext = {
  brief: {
    workingTitle: "开始动作",
    audience: "刚离职的程序员",
    thesis: "缺少开始动作",
  },
  outline: {
    workingTitle: "开始动作",
    audience: "刚离职的程序员",
    thesis: "缺少开始动作",
    sections: [
      {
        heading: "问题",
        purpose: "提出问题",
        keyPoints: ["没有开始动作"],
        evidenceIds: ["m1:e1"],
        missingEvidence: [],
      },
      {
        heading: "做法",
        purpose: "给出做法",
        keyPoints: ["整理笔记"],
        evidenceIds: [],
        missingEvidence: [],
      },
    ],
  },
  sources: [
    {
      id: "m1",
      version: 1,
      title: "离职后的第一个月",
      summary: "缺少开始动作。",
      evidence: [{ id: "e1", quote: "真正拖慢我的不是时间" }],
    },
  ],
};

describe("author profile in prompts", () => {
  it("leaves prompts unchanged without a profile", () => {
    const messages = draftMessages(context);
    expect(withProfile(messages, null)).toEqual(messages);
    expect(withProfile(messages, empty)).toEqual(messages);
  });

  it("adds the profile as preferences, not as facts", () => {
    const [system, user] = withProfile(draftMessages(context), profile);
    expect(system.content).toContain("不是事实来源");
    expect(system.content).toContain("本次 brief 与大纲 > 作者设置");
    expect(user.content).toContain("<作者设置>");
    expect(user.content).toContain("写作主题：写作习惯、小团队协作");
    expect(user.content).toContain("禁用词：赋能、闭环");
  });

  it("finds banned words regardless of case", () => {
    expect(bannedWordsUsed(["这套流程形成了闭环"], ["赋能", "闭环"])).toEqual([
      "闭环",
    ]);
    expect(bannedWordsUsed(["Synergy matters"], ["synergy"])).toEqual([
      "synergy",
    ]);
  });
});

describe("drafting with a profile in deepseek mode", () => {
  const prior = { ...process.env };
  beforeEach(() => {
    process.env.AI_MODE = "deepseek";
    process.env.AI_API_KEY = "test-key";
  });
  afterEach(() => {
    process.env = { ...prior };
  });

  it("repairs a draft that uses a banned word", async () => {
    const clean = createMockDraft(context);
    const replies = [
      { ...clean, markdown: `${clean.markdown}\n\n这能为团队赋能。` },
      clean,
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
    const result = await generateDraft(context, profile, deps);
    expect(result.output.markdown).not.toContain("赋能");
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[0].messages)).toContain("<作者设置>");
    expect(JSON.stringify(bodies[1].messages)).toContain(
      "使用了作者的禁用词：赋能",
    );
  });
});
