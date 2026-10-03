import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "@content-write/db/client";
import { aiJobs, type BreakdownResult } from "@content-write/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { processOneJob } from "../../../worker/src/jobs";
import { COPY_RUN_CHARS } from "../../../worker/src/reference-copy";
import { app } from "../../src/app";
import { cleanup, origin, signIn, write } from "../integration/helpers";

/**
 * Reference copy check against the real model (T038). Not part of CI.
 * Each reference article is broken down, then an article is written from its
 * framework with the author's own materials: outline → draft → one edit. The
 * run records every time the check sent output back for repair, how each job
 * ended, and the longest run the saved text still shares with the original.
 * Reference texts are someone else's work: they stay outside the repository.
 *
 *   REFERENCE_COPY_EVAL_DIR=/tmp/t038-refs REFERENCE_COPY_EVAL_OUT=/tmp/t038-eval \
 *     pnpm --filter @content-write/api eval:reference-copy
 *
 * The directory holds index.json: [{ file, title, ... }]. The output file
 * quotes shared runs of the originals, so it stays outside the repository too.
 * Stop any running worker first so it does not claim these jobs.
 */
type Entry = { file: string; title: string } & Record<string, unknown>;

const dir = process.env.REFERENCE_COPY_EVAL_DIR ?? "/tmp/t038-refs";
const out = process.env.REFERENCE_COPY_EVAL_OUT ?? "/tmp/t038-eval";
const PARALLEL = 4;
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
const brief = {
  workingTitle: "离职后写不出东西，问题不在时间",
  audience: "刚离职、想靠写作做个人品牌的程序员",
  thesis: "拖慢写作的不是时间，而是缺少一个固定的开始动作",
};

const squash = (value: string) => value.replace(/\s+/g, "");

/** The longest run any of the texts shares with any of the originals, ignoring whitespace. */
function longestShared(texts: string[], originals: string[]) {
  const sources = originals.map(squash);
  let best = "";
  for (const text of texts.map(squash))
    for (let start = 0; start < text.length; start++) {
      let length = best.length + 1;
      while (
        start + length <= text.length &&
        sources.some((source) =>
          source.includes(text.slice(start, start + length)),
        )
      )
        length++;
      if (length - 1 > best.length)
        best = text.slice(start, start + length - 1);
    }
  return { chars: best.length, run: best };
}

// Model requests made since the last reset: a second one for a job is its repair.
const requests: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  if (String(input).endsWith("/chat/completions") && init?.body) {
    const { messages } = JSON.parse(String(init.body)) as {
      messages: { role: string; content: string }[];
    };
    requests.push(messages.at(-1)?.content ?? "");
  }
  return realFetch(input, init);
}) as typeof fetch;

async function jobState(jobId: string) {
  const [job] = await getDb()
    .select({ status: aiJobs.status, errorCode: aiJobs.errorCode })
    .from(aiJobs)
    .where(eq(aiJobs.id, jobId));
  return job;
}

/** Starts a generation job and runs it to its end, with the repairs it needed. */
async function run(cookie: string, path: string, body: unknown) {
  const started = await write(cookie, path, body, { key: randomUUID() });
  expect(started.status, path).toBe(202);
  const { jobId } = (await started.json()) as { jobId: string };
  requests.length = 0;
  const began = Date.now();
  let job = await jobState(jobId);
  while (["queued", "running"].includes(job.status)) {
    await processOneJob();
    job = await jobState(jobId);
  }
  const repairs = requests
    .filter((content) => content.startsWith("上一次输出不符合要求"))
    .map((content) => content.slice(0, 120));
  return {
    status: job.status,
    errorCode: job.errorCode,
    calls: requests.length,
    seconds: Math.round((Date.now() - began) / 1000),
    copyRepairs: repairs.filter((reason) => reason.includes("框架来源文章"))
      .length,
    repairs,
  };
}

describe("reference copy evaluation", () => {
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await cleanup();
  });

  it("writes from every reference's framework with the real model", async () => {
    expect(process.env.AI_API_KEY, "AI_API_KEY is required").toBeTruthy();
    process.env.AI_MODE = "deepseek";
    process.env.AI_USER_CONCURRENCY = "20";
    process.env.AI_DAILY_JOB_LIMIT = "200";
    const entries = JSON.parse(
      readFileSync(join(dir, "index.json"), "utf8"),
    ) as Entry[];
    const cookie = await signIn("reference-copy-eval");
    expect((await write(cookie, "/ai/consent", {})).status).toBe(200);
    const get = async <T>(path: string) =>
      (await (
        await app.request(`/api${path}`, { headers: { cookie } })
      ).json()) as T;

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
      chosen.push({ id, version: 1 });
    }

    const references: {
      entry: Entry;
      content: string;
      id: string;
      jobId: string;
    }[] = [];
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
      references.push({ entry, content, id, jobId });
    }
    // Material analyses and breakdowns do not depend on each other.
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        while (await processOneJob()) {}
      }),
    );
    const breakdownRepairs = requests.filter((content) =>
      content.startsWith("上一次输出不符合要求"),
    );

    const results = [];
    for (const { entry, content, id, jobId } of references) {
      const originals = [entry.title, content];
      const breakdownJob = await jobState(jobId);
      const { breakdown } = await get<{
        breakdown: { id: string; result: BreakdownResult } | null;
      }>(`/breakdowns/${id}`);
      const item: Record<string, unknown> = {
        file: entry.file,
        title: entry.title,
        chars: content.length,
        breakdown: {
          status: breakdownJob.status,
          errorCode: breakdownJob.errorCode,
        },
      };
      results.push(item);
      if (!breakdown) continue;
      const {
        spans: _spans,
        audience: _audience,
        ...described
      } = breakdown.result;
      item.framework = longestShared(JSON.stringify(described).split('"'), [
        content,
      ]);

      const article = await write(cookie, "/articles", {
        breakdownId: breakdown.id,
        materials: chosen,
        brief,
      });
      expect(article.status, entry.file).toBe(201);
      const { articleId } = (await article.json()) as { articleId: string };
      type Detail = {
        article: {
          version: number;
          body: string | null;
          outline: unknown;
        };
      };
      const read = () => get<Detail>(`/articles/${articleId}`);

      const outline = await run(
        cookie,
        `/articles/${articleId}/outline/generate`,
        {
          expectedVersion: 1,
        },
      );
      item.outline = outline;
      if (outline.status !== "succeeded") continue;
      const outlined = await read();
      item.outline = {
        ...outline,
        shared: longestShared(
          JSON.stringify(outlined.article.outline).split('"'),
          originals,
        ),
      };

      const confirmed = await write(
        cookie,
        `/articles/${articleId}/outline/confirm`,
        { expectedVersion: outlined.article.version },
      );
      const draft = await run(cookie, `/articles/${articleId}/draft/generate`, {
        expectedVersion: ((await confirmed.json()) as { version: number })
          .version,
      });
      item.draft = draft;
      if (draft.status !== "succeeded") continue;
      const drafted = await read();
      const body = drafted.article.body ?? "";
      item.draft = {
        ...draft,
        chars: body.length,
        shared: longestShared([body], originals),
      };

      // The first section of the draft, rewritten on request.
      const second = body.indexOf("\n## ", body.indexOf("## ") + 1);
      const end = second > 0 ? second : Math.min(body.length, 600);
      const edit = await run(cookie, `/articles/${articleId}/edit`, {
        expectedVersion: drafted.article.version,
        scope: "selection",
        start: 0,
        end,
        selectionText: body.slice(0, end),
        instruction: "改得更口语一些，并补一句承上启下的话",
      });
      item.edit = edit;
      if (edit.status !== "succeeded") continue;
      const { suggestions } = await get<{
        suggestions: { replacement: string }[];
      }>(`/articles/${articleId}/suggestions`);
      item.edit = {
        ...edit,
        shared: longestShared([suggestions[0]?.replacement ?? ""], originals),
      };
      console.log(JSON.stringify(item));
    }

    mkdirSync(out, { recursive: true });
    const model = process.env.AI_MODEL || "deepseek-flash";
    writeFileSync(
      join(out, `${model}.json`),
      JSON.stringify(
        { model, threshold: COPY_RUN_CHARS, breakdownRepairs, results },
        null,
        2,
      ),
    );
  }, 3_600_000);
});
