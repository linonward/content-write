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
  signIn,
  write,
} from "../integration/helpers";

/**
 * Real-model smoke test: calls DeepSeek for all four job kinds. Not part of CI.
 * Run with AI_API_KEY set: pnpm --filter @content-write/api smoke:deepseek
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

describe("DeepSeek smoke", () => {
  afterAll(cleanup);

  it("runs analysis, ideas, outline and draft against the real model", async () => {
    expect(process.env.AI_API_KEY, "AI_API_KEY is required").toBeTruthy();
    process.env.AI_MODE = "deepseek";
    const cookie = await signIn("deepseek-smoke");
    expect((await write(cookie, "/ai/consent", {})).status, "consent").toBe(
      200,
    );
    const ids: string[] = [];
    for (const item of materials) {
      const created = await write(cookie, "/materials", item);
      const id = ((await created.json()) as { material: { id: string } })
        .material.id;
      ids.push(id);
      const job = await app.request(`/api/materials/${id}/process`, {
        method: "POST",
        headers: {
          cookie,
          origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
          "idempotency-key": randomUUID(),
        },
      });
      expect(job.status).toBe(202);
      await finish(((await job.json()) as { jobId: string }).jobId);
    }
    const ideaJob = await write(
      cookie,
      "/ideas/generate",
      { sources: ids.map((id) => ({ id, version: 1 })) },
      { key: randomUUID() },
    );
    expect(ideaJob.status).toBe(202);
    await finish(((await ideaJob.json()) as { jobId: string }).jobId);
    const ideas = (
      (await (
        await app.request("/api/ideas", { headers: { cookie } })
      ).json()) as { ideas: { id: string; title: string; mode: string }[] }
    ).ideas;
    const created = await write(cookie, "/articles", { ideaId: ideas[0].id });
    const articleId = ((await created.json()) as { articleId: string })
      .articleId;
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
    const analyses = await getPool().query<{
      title: string;
      summary: string;
      spans: number;
      claims: number;
    }>(
      `SELECT m.title, a.result->>'summary' AS summary,
              jsonb_array_length(a.result->'evidenceSpans') AS spans,
              jsonb_array_length(a.result->'claims') AS claims
         FROM material_analyses a JOIN materials m ON m.id = a.material_id
        WHERE m.id = ANY($1) AND a.mode = 'deepseek'`,
      [ids],
    );
    const runs = await getPool().query<{
      kind: string;
      mode: string;
      duration_ms: number;
      input_tokens: number;
      output_tokens: number;
      reasoning_tokens: number;
    }>(
      `SELECT j.kind, r.mode, r.duration_ms, r.input_tokens, r.output_tokens, r.reasoning_tokens
         FROM ai_runs r JOIN ai_jobs j ON j.id = r.job_id
        WHERE r.user_id = (SELECT user_id FROM materials WHERE id = $1)
        ORDER BY r.created_at`,
      [ids[0]],
    );
    const outline = article.outline as {
      sections: { heading: string; evidenceIds: string[] }[];
    };
    console.log(
      JSON.stringify(
        {
          runs: runs.rows,
          analyses: analyses.rows,
          ideas: ideas.map((idea) => ({ title: idea.title, mode: idea.mode })),
          outline: outline.sections.map((section) => ({
            heading: section.heading,
            evidence: section.evidenceIds.length,
          })),
          draft: {
            title: article.title,
            chars: article.body?.length,
            mode: article.currentDraft?.mode,
            sourceMap: article.currentDraft?.sourceMap.length,
            gaps: article.currentDraft?.evidenceGaps.length,
            opening: article.body?.slice(0, 160),
          },
        },
        null,
        2,
      ),
    );
    expect(runs.rows.every((run) => run.mode === "deepseek")).toBe(true);
    expect(runs.rows.map((run) => run.kind)).toEqual([
      "material_analysis",
      "material_analysis",
      "idea_generation",
      "outline_generation",
      "draft_generation",
    ]);
    expect(article.currentDraft?.mode).toBe("deepseek");
  }, 600_000);
});
