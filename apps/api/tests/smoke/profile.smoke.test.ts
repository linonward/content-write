import { randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import {
  cleanup,
  confirm,
  detail,
  finish,
  generate,
  origin,
  signIn,
  write,
} from "../integration/helpers";

/**
 * Real-model smoke for T014: the author profile reaches ideas, outline and
 * draft, and banned words stay out. Not part of CI.
 * Run with AI_API_KEY set: pnpm --filter @content-write/api smoke:profile
 */
const materials = [
  {
    title: "离职后的第一个月",
    content:
      "离职那天，我以为自己会有大把时间写东西。第一周睡到自然醒，第二周开始焦虑，第三周才真正坐下来。真正拖慢我的不是时间，而是没有一个固定的开始动作。后来我把每天早上的第一件事改成整理前一天的笔记，写作才慢慢有了节奏。这个月我一共写了 4 篇，其中 3 篇是在固定开始动作之后完成的。",
  },
  {
    title: "写作的最小可行习惯",
    content:
      "我试过给自己定每天写 2000 字的目标，坚持了 5 天就放弃了。后来改成每天只写一段，反而连续写了 30 天。目标太大时，开始本身就变成了负担。我现在的做法是：前一天晚上写好第二天第一段的开头句，早上直接从那句话接着写。",
  },
];
// "焦虑" appears in the author's own material, so the model must work around it.
const profile = {
  bio: "写了八年后端、刚开始做独立开发的程序员",
  topics: ["写作习惯", "独立开发"],
  audience: "想开始写作但总拖延的程序员",
  preferences: "短句，每段先给结论；口语化，不用排比和反问",
  bannedWords: ["焦虑", "赋能", "干货"],
};

describe("profile smoke", () => {
  afterAll(cleanup);

  it("generates with the author's profile against the real model", async () => {
    expect(process.env.AI_API_KEY, "AI_API_KEY is required").toBeTruthy();
    process.env.AI_MODE = "deepseek";
    const cookie = await signIn("profile-smoke");
    expect((await write(cookie, "/ai/consent", {})).status).toBe(200);
    const saved = await write(
      cookie,
      "/profile",
      { expectedVersion: 0, ...profile },
      { method: "PUT" },
    );
    expect(saved.status).toBe(200);

    const ids: string[] = [];
    for (const item of materials) {
      const created = await write(cookie, "/materials", item);
      const id = ((await created.json()) as { material: { id: string } })
        .material.id;
      ids.push(id);
      const job = await app.request(`/api/materials/${id}/process`, {
        method: "POST",
        headers: { cookie, origin, "idempotency-key": randomUUID() },
      });
      await finish(((await job.json()) as { jobId: string }).jobId);
    }
    const ideaJob = await write(
      cookie,
      "/ideas/generate",
      { sources: ids.map((id) => ({ id, version: 1 })) },
      { key: randomUUID() },
    );
    await finish(((await ideaJob.json()) as { jobId: string }).jobId);
    const ideas = (
      (await (
        await app.request("/api/ideas", { headers: { cookie } })
      ).json()) as { ideas: { id: string; title: string; thesis: string }[] }
    ).ideas;
    const created = await write(cookie, "/articles", { ideaId: ideas[0].id });
    const { articleId } = (await created.json()) as { articleId: string };
    const outlineJob = await write(
      cookie,
      `/articles/${articleId}/outline/generate`,
      { expectedVersion: 1 },
      { key: randomUUID() },
    );
    await finish(((await outlineJob.json()) as { jobId: string }).jobId);
    const version = await confirm(cookie, articleId);
    await finish(await generate(cookie, articleId, version));
    const { article } = await detail(cookie, articleId);
    const outline = article.outline as {
      workingTitle: string;
      sections: { heading: string; keyPoints: string[] }[];
    };

    const runs = await getPool().query<{
      kind: string;
      profile_version: number | null;
      duration_ms: number;
      input_tokens: number;
      output_tokens: number;
      reasoning_tokens: number;
    }>(
      `SELECT j.kind, j.profile_version, r.duration_ms, r.input_tokens, r.output_tokens, r.reasoning_tokens
         FROM ai_runs r JOIN ai_jobs j ON j.id = r.job_id
        WHERE r.user_id = (SELECT user_id FROM articles WHERE id = $1)
        ORDER BY r.created_at`,
      [articleId],
    );
    const generated = [
      ...ideas.flatMap((idea) => [idea.title, idea.thesis]),
      outline.workingTitle,
      ...outline.sections.flatMap((section) => [
        section.heading,
        ...section.keyPoints,
      ]),
      article.title ?? "",
      article.body ?? "",
    ].join("\n");
    const body = article.body ?? "";
    const paragraphs = body
      .split(/\n{2,}/)
      .filter((paragraph) => paragraph.trim() && !paragraph.startsWith("#"));
    console.log(
      JSON.stringify(
        {
          runs: runs.rows,
          bannedWordsFound: profile.bannedWords.filter((word) =>
            generated.includes(word),
          ),
          ideas: ideas.map((idea) => idea.title),
          outline: outline.sections.map((section) => section.heading),
          draft: {
            title: article.title,
            chars: body.length,
            paragraphs: paragraphs.length,
            averageSentenceChars: Math.round(
              body.replace(/\s/g, "").length /
                Math.max(1, body.split(/[。！？]/).length - 1),
            ),
            // Sentences that use the bio; it should shape the voice, not appear as a claimed fact.
            bioSentences: body
              .split(/(?<=[。！？\n])/)
              .filter((sentence) => /八年|后端|独立开发/.test(sentence)),
            // The materials are the author's own; the draft should say "我", not "素材作者".
            thirdPersonAuthor: /素材作者|该作者/.test(body),
            opening: body.slice(0, 240),
          },
        },
        null,
        2,
      ),
    );
    expect(
      runs.rows
        .filter((row) => row.kind !== "material_analysis")
        .every((row) => row.profile_version === 1),
    ).toBe(true);
    for (const word of profile.bannedWords)
      expect(generated, word).not.toContain(word);
    expect(body).not.toMatch(/素材作者|该作者/);
  }, 900_000);
});
