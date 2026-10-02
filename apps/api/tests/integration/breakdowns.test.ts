import { randomUUID } from "node:crypto";
import { getDb } from "@content-write/db/client";
import {
  aiJobs,
  aiRuns,
  breakdowns,
  referenceArticleRevisions,
  referenceArticles,
} from "@content-write/db/schema";
import { count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { processOneJob } from "../../../worker/src/jobs";
import { app } from "../../src/app";
import { cleanup, failure, finish, origin, signIn, write } from "./helpers";

const content = [
  "30 岁那年，我从大厂辞职，以为终于自由了。",
  "结果第三个月，我连早上几点起床都决定不了。",
  "后来我才明白，自由不是没人管，而是每件小事都得自己定规则。",
  "你呢？你给自己定过什么规则？",
].join("\n\n");

type Detail = {
  reference: {
    id: string;
    title: string;
    content: string;
    currentVersion: number;
    fetchStatus: string | null;
    status: string;
  };
  breakdown: {
    referenceVersion: number;
    mode: string;
    result: {
      slots: unknown[];
      spans: { quote: string; start: number; end: number }[];
    } & Record<string, unknown>;
  } | null;
  latestJob: { id: string; status: string } | null;
};

const get = (cookie: string, path: string) =>
  app.request(`/api${path}`, { headers: { cookie } });

async function create(cookie: string, body: unknown = { content }) {
  const response = await write(cookie, "/breakdowns", body);
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

async function detail(cookie: string, id: string) {
  const response = await get(cookie, `/breakdowns/${id}`);
  expect(response.status).toBe(200);
  return (await response.json()) as Detail;
}

function process(cookie: string, id: string, version = 1, key = randomUUID()) {
  return write(
    cookie,
    `/breakdowns/${id}/process`,
    { expectedVersion: version },
    { key },
  );
}

async function rowCounts(id: string) {
  const db = getDb();
  const [[references], [revisions], [results], [jobs]] = await Promise.all([
    db
      .select({ n: count() })
      .from(referenceArticles)
      .where(eq(referenceArticles.id, id)),
    db
      .select({ n: count() })
      .from(referenceArticleRevisions)
      .where(eq(referenceArticleRevisions.referenceArticleId, id)),
    db
      .select({ n: count() })
      .from(breakdowns)
      .where(eq(breakdowns.referenceArticleId, id)),
    db
      .select({ n: count() })
      .from(aiJobs)
      .where(eq(aiJobs.referenceArticleId, id)),
  ]);
  return {
    references: references.n,
    revisions: revisions.n,
    breakdowns: results.n,
    jobs: jobs.n,
  };
}

describe("reference articles and breakdowns", () => {
  afterAll(cleanup);

  it("keeps reference articles private to their owner", async () => {
    const owner = await signIn("breakdown-owner");
    const other = await signIn("breakdown-other");
    expect((await app.request("/api/breakdowns")).status).toBe(401);
    const id = await create(owner);
    const { reference } = await detail(owner, id);
    expect(reference.title).toBe("30 岁那年，我从大厂辞职，以为终于自由了。");
    expect(reference.status).toBe("unprocessed");

    expect((await get(other, `/breakdowns/${id}`)).status).toBe(404);
    expect(
      (
        await write(
          other,
          `/breakdowns/${id}`,
          { expectedVersion: 1, title: "t", content: "c" },
          { method: "PATCH" },
        )
      ).status,
    ).toBe(404);
    expect((await process(other, id)).status).toBe(404);
    expect(
      (await write(other, `/breakdowns/${id}`, {}, { method: "DELETE" }))
        .status,
    ).toBe(404);
    const list = (await (await get(other, "/breakdowns")).json()) as {
      references: unknown[];
    };
    expect(list.references).toHaveLength(0);
    expect(
      (
        await write(
          owner,
          "/breakdowns",
          { content },
          {
            source: "https://untrusted.example",
          },
        )
      ).status,
    ).toBe(403);
  });

  it("validates input size and shape", async () => {
    const owner = await signIn("breakdown-input");
    expect(
      await failure(
        await write(owner, "/breakdowns", { content: "字".repeat(50_001) }),
      ),
    ).toMatchObject({ status: 413, code: "REFERENCE_TOO_LARGE" });
    expect(
      await failure(await write(owner, "/breakdowns", { content: "  " })),
    ).toMatchObject({ status: 422, code: "INVALID_REFERENCE" });
    expect(
      await failure(
        await write(owner, "/breakdowns", { url: "http://127.0.0.1/a" }),
      ),
    ).toMatchObject({ status: 422, code: "INVALID_LINK" });
  });

  it("keeps a link whose text is not fetched and asks for the text", async () => {
    const owner = await signIn("breakdown-link");
    const created = await write(owner, "/breakdowns", {
      url: "https://mp.weixin.qq.com/s/example",
      fetch: true,
    });
    expect(created.status).toBe(201);
    // REMOTE_FETCH_ENABLED is off in tests: the link is saved without fetching.
    const { id, fetchStatus } = (await created.json()) as {
      id: string;
      fetchStatus: string;
    };
    expect(fetchStatus).toBe("disabled");
    expect(await failure(await process(owner, id))).toMatchObject({
      status: 422,
      code: "REFERENCE_CONTENT_REQUIRED",
    });
    const pasted = await write(
      owner,
      `/breakdowns/${id}`,
      { expectedVersion: 1, title: "粘贴的标题", content },
      { method: "PATCH" },
    );
    expect(await pasted.json()).toEqual({ version: 2 });
    const { reference } = await detail(owner, id);
    expect(reference).toMatchObject({
      currentVersion: 2,
      fetchStatus: "manual",
      content,
    });
    expect(
      await failure(
        await write(
          owner,
          `/breakdowns/${id}`,
          { expectedVersion: 1, title: "旧", content },
          { method: "PATCH" },
        ),
      ),
    ).toMatchObject({ status: 409, code: "REFERENCE_VERSION_CONFLICT" });
  });

  it("breaks down the current version once, idempotently, as structure only", async () => {
    const owner = await signIn("breakdown-run");
    const id = await create(owner, { title: "参考", content });
    const key = randomUUID();
    const started = await process(owner, id, 1, key);
    expect(started.status).toBe(202);
    const { jobId } = (await started.json()) as { jobId: string };
    expect(
      ((await (await process(owner, id, 1, key)).json()) as { jobId: string })
        .jobId,
    ).toBe(jobId);
    expect(await failure(await process(owner, id, 2, key))).toMatchObject({
      status: 409,
      code: "IDEMPOTENCY_CONFLICT",
    });
    expect(await failure(await process(owner, id))).toMatchObject({
      status: 409,
      code: "BREAKDOWN_JOB_ACTIVE",
    });
    expect((await detail(owner, id)).reference.status).toBe("processing");

    await finish(jobId);
    const { reference, breakdown } = await detail(owner, id);
    expect(reference.status).toBe("done");
    expect(breakdown?.referenceVersion).toBe(1);
    expect(breakdown?.mode).toBe("mock");
    expect(Object.keys(breakdown?.result ?? {}).sort()).toEqual([
      "audience",
      "ending",
      "hook",
      "limitations",
      "rhythm",
      "slots",
      "spans",
      "titlePattern",
      "whyItWorks",
    ]);
    for (const span of breakdown?.result.spans ?? [])
      expect(content.slice(span.start, span.end)).toBe(span.quote);
    expect(await failure(await process(owner, id))).toMatchObject({
      status: 409,
      code: "ALREADY_BROKEN_DOWN",
    });

    // A new version has no breakdown until the author asks again.
    await write(
      owner,
      `/breakdowns/${id}`,
      { expectedVersion: 1, title: "参考", content: `${content}\n\n补一段。` },
      { method: "PATCH" },
    );
    const edited = await detail(owner, id);
    expect(edited.breakdown).toBeNull();
    expect(edited.reference.status).toBe("unprocessed");
  });

  it("does not send an edited reference to the model", async () => {
    const owner = await signIn("breakdown-stale");
    const id = await create(owner);
    const { jobId } = (await (await process(owner, id)).json()) as {
      jobId: string;
    };
    await write(
      owner,
      `/breakdowns/${id}`,
      { expectedVersion: 1, title: "改过", content: "改过的正文。" },
      { method: "PATCH" },
    );
    await processOneJob();
    const [job] = await getDb()
      .select({ status: aiJobs.status })
      .from(aiJobs)
      .where(eq(aiJobs.id, jobId));
    expect(job.status).toBe("stale");
    expect((await rowCounts(id)).breakdowns).toBe(0);
  });

  it("deleting removes the text, revisions, results and pending jobs", async () => {
    const owner = await signIn("breakdown-delete");
    const done = await create(owner);
    const { jobId } = (await (await process(owner, done)).json()) as {
      jobId: string;
    };
    await finish(jobId);
    const pending = await create(owner);
    expect((await process(owner, pending)).status).toBe(202);

    for (const id of [done, pending]) {
      const deleted = await app.request(`/api/breakdowns/${id}`, {
        method: "DELETE",
        headers: { cookie: owner, origin },
      });
      expect(deleted.status).toBe(204);
      expect((await get(owner, `/breakdowns/${id}`)).status).toBe(404);
      expect(await rowCounts(id)).toEqual({
        references: 0,
        revisions: 0,
        breakdowns: 0,
        jobs: 0,
      });
    }
    // Usage stays auditable without pointing at removed content.
    const [run] = await getDb()
      .select({ jobId: aiRuns.jobId })
      .from(aiRuns)
      .where(eq(aiRuns.userId, (await whoAmI(owner)) ?? ""));
    expect(run).toEqual({ jobId: null });
    // The deleted pending job no longer exists for the worker to claim.
    expect(await processOneJob()).toBe(false);
  });
});

async function whoAmI(cookie: string) {
  const response = await get(cookie, "/me");
  return ((await response.json()) as { user?: { id: string } }).user?.id;
}
