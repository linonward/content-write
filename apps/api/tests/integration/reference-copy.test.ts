import { randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";
import { afterAll, describe, expect, it } from "vitest";
import { createMockAnalysis } from "../../../worker/src/analysis";
import { processOneJob } from "../../../worker/src/jobs";
import { app } from "../../src/app";
import { cleanup, finish, origin, signIn, write } from "./helpers";

// Generated text is checked against the original behind the article's framework (T038).
const lifted = "结果第三个月，我连早上几点起床都决定不了。";
const reference = [
  "30 岁那年，我从大厂辞职，以为终于自由了。",
  lifted,
  "后来我才明白，自由不是没人管，而是每件小事都得自己定规则。",
].join("\n\n");
const brief = {
  workingTitle: "离职后的写作陷阱",
  audience: "刚离职的程序员",
  thesis: "拖慢写作的不是时间，而是缺少固定的开始动作",
};

type Section = { keyPoints: string[] } & Record<string, unknown>;
type Detail = {
  article: {
    version: number;
    breakdownId: string | null;
    outline: { sections: Section[] } | null;
    title: string | null;
    body: string | null;
  };
};

async function detail(cookie: string, id: string) {
  const response = await app.request(`/api/articles/${id}`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as Detail).article;
}

/** An article bound to a mock breakdown of the reference, with one analyzed material. */
async function boundArticle(cookie: string) {
  const content = "真正拖慢我的不是时间，而是没有固定的开始动作。";
  const material = await write(cookie, "/materials", {
    title: "我的素材",
    content,
  });
  const materialId = ((await material.json()) as { material: { id: string } })
    .material.id;
  await getPool().query(
    "INSERT INTO material_analyses (id, material_id, user_id, material_version, result, mode) SELECT $1,id,user_id,1,$3::jsonb,'mock' FROM materials WHERE id = $2",
    [randomUUID(), materialId, JSON.stringify(createMockAnalysis(content))],
  );
  const created = await write(cookie, "/breakdowns", {
    title: "参考",
    content: reference,
  });
  const { id: referenceId } = (await created.json()) as { id: string };
  const started = await write(
    cookie,
    `/breakdowns/${referenceId}/process`,
    { expectedVersion: 1 },
    { key: randomUUID() },
  );
  await finish(((await started.json()) as { jobId: string }).jobId);
  const { breakdown } = (await (
    await app.request(`/api/breakdowns/${referenceId}`, { headers: { cookie } })
  ).json()) as { breakdown: { id: string } };
  const article = await write(cookie, "/articles", {
    breakdownId: breakdown.id,
    materials: [{ id: materialId, version: 1 }],
    brief,
  });
  expect(article.status).toBe(201);
  const { articleId } = (await article.json()) as { articleId: string };
  return { articleId, referenceId };
}

async function start(cookie: string, path: string, body: unknown) {
  const started = await write(cookie, path, body, { key: randomUUID() });
  expect(started.status, path).toBe(202);
  return ((await started.json()) as { jobId: string }).jobId;
}

/** Runs the job once and returns how it ended, as the author's client sees it. */
async function outcome(cookie: string, jobId: string) {
  await processOneJob();
  const response = await app.request(`/api/jobs/${jobId}`, {
    headers: { cookie },
  });
  const { job } = (await response.json()) as {
    job: { status: string; errorCode: string | null };
  };
  return { status: job.status, errorCode: job.errorCode };
}

const copied = { status: "failed", errorCode: "REFERENCE_COPIED" };

/** Puts text into the first slot of the framework snapshot, as a careless breakdown would. */
function setSlotPurpose(articleId: string, purpose: string) {
  return getPool().query(
    "UPDATE articles SET framework = jsonb_set(framework, '{slots,0,purpose}', to_jsonb($2::text)) WHERE id = $1",
    [articleId, purpose],
  );
}

async function count(table: string, articleId: string) {
  const rows = await getPool().query<{ count: string }>(
    `SELECT count(*) FROM ${table} WHERE article_id = $1`,
    [articleId],
  );
  return Number(rows.rows[0].count);
}

describe("reference original never enters generated text", () => {
  afterAll(cleanup);

  it("fails outline, draft and edit jobs that carry the original and saves nothing", async () => {
    const owner = await signIn("reference-copy");
    const { articleId } = await boundArticle(owner);

    // Outline: the framework carries a sentence of the original into a section.
    await setSlotPurpose(articleId, lifted);
    expect(
      await outcome(
        owner,
        await start(owner, `/articles/${articleId}/outline/generate`, {
          expectedVersion: 1,
        }),
      ),
    ).toEqual(copied);
    const untouched = await detail(owner, articleId);
    expect(untouched.outline).toBeNull();
    expect(untouched.version).toBe(1);

    await setSlotPurpose(articleId, "这一段的作用");
    await finish(
      await start(owner, `/articles/${articleId}/outline/generate`, {
        expectedVersion: 1,
      }),
    );
    const outlined = await detail(owner, articleId);
    const outline = outlined.outline as NonNullable<typeof outlined.outline>;

    // Draft: the author typed the sentence into the outline; saving is theirs to do,
    // but the generated draft may not carry it.
    const withLifted = await write(
      owner,
      `/articles/${articleId}/outline`,
      {
        expectedVersion: outlined.version,
        outline: {
          ...outline,
          sections: outline.sections.map((section, index) =>
            index === 0 ? { ...section, keyPoints: [lifted] } : section,
          ),
        },
      },
      { method: "PUT" },
    );
    expect(withLifted.status).toBe(200);
    const confirm = async (version: number) =>
      (
        (await (
          await write(owner, `/articles/${articleId}/outline/confirm`, {
            expectedVersion: version,
          })
        ).json()) as { version: number }
      ).version;
    let version = await confirm(
      ((await withLifted.json()) as { version: number }).version,
    );
    expect(
      await outcome(
        owner,
        await start(owner, `/articles/${articleId}/draft/generate`, {
          expectedVersion: version,
        }),
      ),
    ).toEqual(copied);
    expect(await count("article_drafts", articleId)).toBe(0);
    expect((await detail(owner, articleId)).body).toBeNull();

    const cleaned = await write(
      owner,
      `/articles/${articleId}/outline`,
      { expectedVersion: version, outline },
      { method: "PUT" },
    );
    version = await confirm(
      ((await cleaned.json()) as { version: number }).version,
    );
    await finish(
      await start(owner, `/articles/${articleId}/draft/generate`, {
        expectedVersion: version,
      }),
    );
    const drafted = await detail(owner, articleId);
    const body = drafted.body ?? "";
    expect(body).not.toContain(lifted);

    // Edit: the mock appends the instruction, which here carries the original.
    const end = body.indexOf("\n\n");
    const selection = { start: 0, end, selectionText: body.slice(0, end) };
    expect(
      await outcome(
        owner,
        await start(owner, `/articles/${articleId}/edit`, {
          expectedVersion: drafted.version,
          scope: "selection",
          ...selection,
          instruction: `加上这句：${lifted}`,
        }),
      ),
    ).toEqual(copied);
    const pending = await getPool().query<{
      status: string;
      replacement: string | null;
    }>(
      "SELECT status, replacement FROM edit_suggestions WHERE article_id = $1",
      [articleId],
    );
    expect(pending.rows).toHaveLength(1);
    expect(pending.rows[0].status).not.toBe("ready");
    expect(pending.rows[0].replacement).toBeNull();

    // Text the author pasted into the body is theirs: editing it is not blocked.
    const pasted = `${lifted}\n\n${body}`;
    const saved = await write(
      owner,
      `/articles/${articleId}/body`,
      {
        expectedVersion: drafted.version,
        title: drafted.title,
        body: pasted,
      },
      { method: "PUT" },
    );
    expect(saved.status).toBe(200);
    await finish(
      await start(owner, `/articles/${articleId}/edit`, {
        expectedVersion: ((await saved.json()) as { version: number }).version,
        scope: "selection",
        start: 0,
        end: lifted.length,
        selectionText: lifted,
        instruction: "写得更口语一些",
      }),
    );
  });

  it("checks nothing once the reference article and its original are deleted", async () => {
    const owner = await signIn("reference-copy-deleted");
    const { articleId, referenceId } = await boundArticle(owner);
    await setSlotPurpose(articleId, lifted);
    const deleted = await app.request(`/api/breakdowns/${referenceId}`, {
      method: "DELETE",
      headers: { cookie: owner, origin },
    });
    expect(deleted.status).toBe(204);
    const before = await detail(owner, articleId);
    expect(before.breakdownId).toBeNull();
    // The original is gone, so there is nothing left to compare against.
    await finish(
      await start(owner, `/articles/${articleId}/outline/generate`, {
        expectedVersion: before.version,
      }),
    );
  });

  it("compares against the reference bound to the article, not other authors' references", async () => {
    const owner = await signIn("reference-copy-owner");
    const other = await signIn("reference-copy-other");
    await boundArticle(owner);
    // The owner's reference holds the sentence; the other author's bound reference does not.
    const { articleId, referenceId } = await boundArticle(other);
    await getPool().query(
      "UPDATE reference_article_revisions SET content = '另一篇完全不同的文章，没有那句话。' WHERE reference_article_id = $1",
      [referenceId],
    );
    await setSlotPurpose(articleId, lifted);
    await finish(
      await start(other, `/articles/${articleId}/outline/generate`, {
        expectedVersion: 1,
      }),
    );
  });
});
