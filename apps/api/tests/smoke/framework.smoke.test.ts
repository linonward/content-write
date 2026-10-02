import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "@content-write/db/client";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { cleanup, finish, origin, signIn, write } from "../integration/helpers";

/**
 * Real-model smoke for T030: reference article → breakdown → article from its
 * framework with the author's own materials → slot outline → draft. Not in CI.
 * The reference is someone else's work and stays outside the repository:
 *
 *   FRAMEWORK_SMOKE_DIR=/tmp/t030-smoke pnpm --filter @content-write/api smoke:framework
 *
 * The directory holds reference.txt and title.txt. Stop any running worker first.
 */
const dir = process.env.FRAMEWORK_SMOKE_DIR ?? "/tmp/t030-smoke";
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

async function run(cookie: string, path: string, body: unknown) {
  const started = await write(cookie, path, body, { key: randomUUID() });
  expect(started.status, path).toBe(202);
  await finish(((await started.json()) as { jobId: string }).jobId);
}

/** Longest run of characters the draft shares with the reference, ignoring whitespace. */
function longestSharedRun(draft: string, reference: string) {
  const a = draft.replace(/\s+/g, "");
  const b = reference.replace(/\s+/g, "");
  let longest = 0;
  for (let start = 0; start < a.length; start++) {
    let length = longest + 1;
    while (
      start + length <= a.length &&
      b.includes(a.slice(start, start + length))
    )
      length++;
    longest = Math.max(longest, length - 1);
  }
  return longest;
}

describe("framework smoke", () => {
  afterAll(cleanup);

  it("writes from a real breakdown's framework with real calls", async () => {
    expect(process.env.AI_API_KEY, "AI_API_KEY is required").toBeTruthy();
    process.env.AI_MODE = "deepseek";
    const reference = readFileSync(join(dir, "reference.txt"), "utf8").trim();
    const title = readFileSync(join(dir, "title.txt"), "utf8").trim();
    const cookie = await signIn("framework-smoke");
    expect((await write(cookie, "/ai/consent", {})).status).toBe(200);

    const chosen: { id: string; version: number }[] = [];
    for (const item of materials) {
      const created = await write(cookie, "/materials", item);
      const id = ((await created.json()) as { material: { id: string } })
        .material.id;
      const job = await app.request(`/api/materials/${id}/process`, {
        method: "POST",
        headers: { cookie, origin, "idempotency-key": randomUUID() },
      });
      expect(job.status).toBe(202);
      await finish(((await job.json()) as { jobId: string }).jobId);
      chosen.push({ id, version: 1 });
    }

    const created = await write(cookie, "/breakdowns", {
      title,
      content: reference,
    });
    const { id: referenceId } = (await created.json()) as { id: string };
    await run(cookie, `/breakdowns/${referenceId}/process`, {
      expectedVersion: 1,
    });
    const breakdown = (await (
      await app.request(`/api/breakdowns/${referenceId}`, {
        headers: { cookie },
      })
    ).json()) as { breakdown: { id: string } };

    const article = await write(cookie, "/articles", {
      breakdownId: breakdown.breakdown.id,
      materials: chosen,
      brief: {
        workingTitle: "离职后写不出东西，问题不在时间",
        audience: "刚离职、想靠写作做个人品牌的程序员",
        thesis: "拖慢写作的不是时间，而是缺少一个固定的开始动作",
      },
    });
    expect(article.status).toBe(201);
    const { articleId } = (await article.json()) as { articleId: string };
    await run(cookie, `/articles/${articleId}/outline/generate`, {
      expectedVersion: 1,
    });
    type Detail = {
      article: {
        version: number;
        title: string | null;
        body: string | null;
        framework: { name: string; slots: { id: string; name: string }[] };
        outline: {
          sections: {
            slotId?: string;
            heading: string;
            evidenceIds: string[];
            missingEvidence: string[];
          }[];
        };
        currentDraft: {
          sourceMap: { materialId: string }[];
          evidenceGaps: string[];
        } | null;
      };
    };
    const read = async () =>
      (await (
        await app.request(`/api/articles/${articleId}`, { headers: { cookie } })
      ).json()) as Detail;
    const outlined = await read();
    expect(
      outlined.article.outline.sections.map((section) => section.slotId),
    ).toEqual(outlined.article.framework.slots.map((slot) => slot.id));

    const confirmed = await write(
      cookie,
      `/articles/${articleId}/outline/confirm`,
      {
        expectedVersion: outlined.article.version,
      },
    );
    const version = ((await confirmed.json()) as { version: number }).version;
    await run(cookie, `/articles/${articleId}/draft/generate`, {
      expectedVersion: version,
    });
    const drafted = await read();
    const body = drafted.article.body ?? "";
    expect(
      drafted.article.currentDraft?.sourceMap.every((entry) =>
        chosen.some((item) => item.id === entry.materialId),
      ),
    ).toBe(true);

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
        WHERE r.user_id = (SELECT user_id FROM articles WHERE id = $1)
        ORDER BY r.created_at`,
      [articleId],
    );
    console.log(
      JSON.stringify(
        {
          runs: runs.rows,
          framework: {
            name: drafted.article.framework.name,
            slots: drafted.article.framework.slots.map((slot) => slot.name),
          },
          outline: outlined.article.outline.sections.map((section) => ({
            slot: section.slotId,
            heading: section.heading,
            evidence: section.evidenceIds.length,
            missing: section.missingEvidence,
          })),
          draft: {
            title: drafted.article.title,
            chars: body.length,
            sourceMap: drafted.article.currentDraft?.sourceMap.length,
            gaps: drafted.article.currentDraft?.evidenceGaps.length,
            longestRunSharedWithReference: longestSharedRun(body, reference),
            opening: body.slice(0, 200),
          },
        },
        null,
        2,
      ),
    );
    expect(runs.rows.every((row) => row.mode === "deepseek")).toBe(true);
  }, 900_000);
});
