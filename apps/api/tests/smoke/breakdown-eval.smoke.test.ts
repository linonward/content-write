import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "@content-write/db/client";
import { aiJobs, aiRuns, breakdowns } from "@content-write/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { processOneJob } from "../../../worker/src/jobs";
import { cleanup, signIn, write } from "../integration/helpers";

/**
 * Breakdown quality run against the real model (T029). Not part of CI.
 * Reference texts are someone else's work: they stay outside the repository.
 *
 *   BREAKDOWN_EVAL_DIR=/tmp/t029-refs BREAKDOWN_EVAL_OUT=/tmp/t029-eval \
 *     pnpm --filter @content-write/api eval:breakdown
 *
 * The directory holds index.json: [{ file, title, ... }]. Results, usage and
 * failures for each article go to BREAKDOWN_EVAL_OUT/<model>.json for manual review.
 * Stop any running worker first so it does not claim these jobs.
 */
type Entry = { file: string; title: string } & Record<string, unknown>;

const dir = process.env.BREAKDOWN_EVAL_DIR ?? "/tmp/t029-refs";
const out = process.env.BREAKDOWN_EVAL_OUT ?? "/tmp/t029-eval";
const PARALLEL = 4;

describe("breakdown quality run", () => {
  afterAll(cleanup);

  it("breaks down every reference article with the real model", async () => {
    expect(process.env.AI_API_KEY, "AI_API_KEY is required").toBeTruthy();
    process.env.AI_MODE = "deepseek";
    process.env.AI_USER_CONCURRENCY = "20";
    process.env.AI_DAILY_JOB_LIMIT = "100";
    const entries = JSON.parse(
      readFileSync(join(dir, "index.json"), "utf8"),
    ) as Entry[];
    const cookie = await signIn("breakdown-eval");
    expect((await write(cookie, "/ai/consent", {})).status).toBe(200);

    const jobs: { entry: Entry; content: string; jobId: string }[] = [];
    for (const entry of entries) {
      const content = readFileSync(join(dir, entry.file), "utf8").trim();
      const created = await write(cookie, "/breakdowns", {
        title: entry.title.slice(0, 200),
        content,
      });
      expect(created.status, entry.file).toBe(201);
      const { id } = (await created.json()) as { id: string };
      const started = await write(
        cookie,
        `/breakdowns/${id}/process`,
        { expectedVersion: 1 },
        { key: randomUUID() },
      );
      expect(started.status, entry.file).toBe(202);
      const { jobId } = (await started.json()) as { jobId: string };
      jobs.push({ entry, content, jobId });
    }

    const began = Date.now();
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        while (await processOneJob()) {}
      }),
    );

    const results = [];
    for (const { entry, content, jobId } of jobs) {
      const [job] = await getDb()
        .select({
          status: aiJobs.status,
          errorCode: aiJobs.errorCode,
          attempts: aiJobs.attempts,
          referenceArticleId: aiJobs.referenceArticleId,
        })
        .from(aiJobs)
        .where(eq(aiJobs.id, jobId));
      const [result] = job.referenceArticleId
        ? await getDb()
            .select({ result: breakdowns.result })
            .from(breakdowns)
            .where(eq(breakdowns.referenceArticleId, job.referenceArticleId))
        : [];
      const runs = await getDb()
        .select({
          durationMs: aiRuns.durationMs,
          inputTokens: aiRuns.inputTokens,
          outputTokens: aiRuns.outputTokens,
          reasoningTokens: aiRuns.reasoningTokens,
        })
        .from(aiRuns)
        .where(eq(aiRuns.jobId, jobId));
      results.push({
        file: entry.file,
        title: entry.title,
        chars: content.length,
        status: job.status,
        errorCode: job.errorCode,
        attempts: job.attempts,
        usage: runs[0] ?? null,
        result: result?.result ?? null,
      });
    }
    mkdirSync(out, { recursive: true });
    const model = process.env.AI_MODEL || "deepseek-flash";
    writeFileSync(
      join(out, `${model}.json`),
      JSON.stringify(
        { model, wallClockMs: Date.now() - began, results },
        null,
        2,
      ),
    );
    console.log(
      results.map((item) => ({
        file: item.file,
        status: item.status,
        errorCode: item.errorCode,
        attempts: item.attempts,
        slots: item.result?.slots.length ?? null,
        spans: item.result?.spans.length ?? null,
        ...item.usage,
      })),
    );
  }, 1_800_000);
});
