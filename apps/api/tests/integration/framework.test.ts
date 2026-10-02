import { randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";
import { afterAll, describe, expect, it } from "vitest";
import { createMockAnalysis } from "../../../worker/src/analysis";
import { app } from "../../src/app";
import {
  cleanup,
  confirmedArticle,
  failure,
  finish,
  generate,
  origin,
  signIn,
  write,
} from "./helpers";

const reference = [
  "30 岁那年，我从大厂辞职，以为终于自由了。",
  "结果第三个月，我连早上几点起床都决定不了。",
  "后来我才明白，自由不是没人管，而是每件小事都得自己定规则。",
].join("\n\n");
const brief = {
  workingTitle: "离职后的写作陷阱",
  audience: "刚离职的程序员",
  thesis: "拖慢写作的不是时间，而是缺少固定的开始动作",
};

type Section = {
  slotId?: string;
  heading: string;
  purpose: string;
  keyPoints: string[];
  evidenceIds: string[];
  missingEvidence: string[];
};
type Detail = {
  article: {
    version: number;
    breakdownId: string | null;
    referenceArticleId: string | null;
    framework: { name: string; slots: { id: string; name: string }[] } | null;
    outline: { workingTitle: string; sections: Section[] } | null;
    body: string | null;
    sources: { materialId: string }[];
  };
};

async function detail(cookie: string, id: string) {
  const response = await app.request(`/api/articles/${id}`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Detail;
}

/** An analyzed material at version 1. */
async function material(cookie: string, content: string) {
  const created = await write(cookie, "/materials", {
    title: "我的素材",
    content,
  });
  expect(created.status).toBe(201);
  const id = ((await created.json()) as { material: { id: string } }).material
    .id;
  await getPool().query(
    "INSERT INTO material_analyses (id, material_id, user_id, material_version, result, mode) SELECT $1,id,user_id,1,$3::jsonb,'mock' FROM materials WHERE id = $2",
    [randomUUID(), id, JSON.stringify(createMockAnalysis(content))],
  );
  return id;
}

/** A reference article broken down by the mock worker. */
async function breakdown(cookie: string) {
  const created = await write(cookie, "/breakdowns", {
    title: "参考",
    content: reference,
  });
  const { id } = (await created.json()) as { id: string };
  const started = await write(
    cookie,
    `/breakdowns/${id}/process`,
    { expectedVersion: 1 },
    { key: randomUUID() },
  );
  await finish(((await started.json()) as { jobId: string }).jobId);
  const response = await app.request(`/api/breakdowns/${id}`, {
    headers: { cookie },
  });
  const body = (await response.json()) as { breakdown: { id: string } };
  return { referenceId: id, breakdownId: body.breakdown.id };
}

async function fromBreakdown(
  cookie: string,
  breakdownId: string,
  materials: { id: string; version: number }[],
) {
  return write(cookie, "/articles", { breakdownId, materials, brief });
}

async function outline(cookie: string, articleId: string, version: number) {
  const started = await write(
    cookie,
    `/articles/${articleId}/outline/generate`,
    { expectedVersion: version },
    { key: randomUUID() },
  );
  expect(started.status).toBe(202);
  await finish(((await started.json()) as { jobId: string }).jobId);
  return detail(cookie, articleId);
}

function saveOutline(
  cookie: string,
  articleId: string,
  version: number,
  value: unknown,
) {
  return write(
    cookie,
    `/articles/${articleId}/outline`,
    { expectedVersion: version, outline: value },
    { method: "PUT" },
  );
}

describe("writing with a framework", () => {
  afterAll(cleanup);

  it("creates an article from a breakdown with the author's own materials", async () => {
    const owner = await signIn("framework-owner");
    const other = await signIn("framework-other");
    const { referenceId, breakdownId } = await breakdown(owner);
    const mine = await material(
      owner,
      "真正拖慢我的不是时间，而是没有固定的开始动作。",
    );

    const created = await fromBreakdown(owner, breakdownId, [
      { id: mine, version: 1 },
    ]);
    expect(created.status).toBe(201);
    const { articleId } = (await created.json()) as { articleId: string };
    const { article } = await detail(owner, articleId);
    expect(article.breakdownId).toBe(breakdownId);
    expect(article.referenceArticleId).toBe(referenceId);
    expect(article.framework?.slots.length).toBeGreaterThanOrEqual(3);
    expect(article.sources.map((source) => source.materialId)).toEqual([mine]);
    // The snapshot carries structure only: no spans, no audience, no original text.
    const snapshot = JSON.stringify(article.framework);
    expect(snapshot).not.toContain("spans");
    expect(snapshot).not.toContain("spanIds");
    expect(snapshot).not.toContain("audience");
    for (const line of reference.split("\n\n"))
      expect(snapshot).not.toContain(line.slice(0, 12));

    // Someone else's breakdown or materials are invisible.
    expect(
      await failure(
        await fromBreakdown(other, breakdownId, [{ id: mine, version: 1 }]),
      ),
    ).toMatchObject({ status: 404, code: "BREAKDOWN_NOT_FOUND" });
    const { breakdownId: theirs } = await breakdown(other);
    expect(
      await failure(
        await fromBreakdown(other, theirs, [{ id: mine, version: 1 }]),
      ),
    ).toMatchObject({ status: 409, code: "MATERIALS_NOT_READY" });
    expect(
      (
        await app.request(`/api/articles/${articleId}`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
  });

  it("only accepts current, analyzed materials and never the reference article", async () => {
    const owner = await signIn("framework-materials");
    const { referenceId, breakdownId } = await breakdown(owner);
    const mine = await material(owner, "作者自己的经历。");
    const unanalyzed = await write(owner, "/materials", {
      title: "未整理",
      content: "还没有整理。",
    });
    const raw = ((await unanalyzed.json()) as { material: { id: string } })
      .material.id;
    for (const materials of [
      [{ id: mine, version: 2 }],
      [{ id: raw, version: 1 }],
      [{ id: referenceId, version: 1 }],
    ])
      expect(
        await failure(await fromBreakdown(owner, breakdownId, materials)),
      ).toMatchObject({ status: 409, code: "MATERIALS_NOT_READY" });
    expect(
      (
        await fromBreakdown(owner, breakdownId, [
          { id: mine, version: 1 },
          { id: mine, version: 1 },
        ])
      ).status,
    ).toBe(422);
  });

  it("outlines by slot, validates slots and rejects reference evidence", async () => {
    const owner = await signIn("framework-outline");
    const { referenceId, breakdownId } = await breakdown(owner);
    const mine = await material(
      owner,
      "真正拖慢我的不是时间，而是没有固定的开始动作。",
    );
    const created = await fromBreakdown(owner, breakdownId, [
      { id: mine, version: 1 },
    ]);
    const { articleId } = (await created.json()) as { articleId: string };
    const { article } = await outline(owner, articleId, 1);
    const slots = article.framework?.slots.map((slot) => slot.id) ?? [];
    expect(article.outline?.sections.map((section) => section.slotId)).toEqual(
      slots,
    );
    // One span from one material: every slot after the first is a gap.
    expect(article.outline?.sections[1].evidenceIds).toEqual([]);
    expect(article.outline?.sections[1].missingEvidence.length).toBe(1);

    const current = article.outline as NonNullable<typeof article.outline>;
    const withSections = (sections: Section[]) => ({ ...current, sections });
    // The author may drop a gap section; unknown or repeated slots are refused.
    const dropped = await saveOutline(
      owner,
      articleId,
      article.version,
      withSections(current.sections.filter((_, index) => index !== 1)),
    );
    expect(dropped.status).toBe(200);
    const version = ((await dropped.json()) as { version: number }).version;
    for (const sections of [
      current.sections.map((section, index) =>
        index === 0 ? { ...section, slotId: "slot99" } : section,
      ),
      current.sections.map((section) => ({ ...section, slotId: slots[0] })),
    ])
      expect(
        await failure(
          await saveOutline(owner, articleId, version, withSections(sections)),
        ),
      ).toMatchObject({ status: 422, code: "INVALID_SLOTS" });
    expect(
      await failure(
        await saveOutline(
          owner,
          articleId,
          version,
          withSections(
            current.sections.map((section, index) =>
              index === 0
                ? { ...section, evidenceIds: [`${referenceId}:s1`] }
                : section,
            ),
          ),
        ),
      ),
    ).toMatchObject({ status: 422, code: "INVALID_EVIDENCE" });

    // Drafting is unchanged and maps claims only to the author's material.
    const confirmed = await write(
      owner,
      `/articles/${articleId}/outline/confirm`,
      {
        expectedVersion: version,
      },
    );
    const draftJob = await generate(
      owner,
      articleId,
      ((await confirmed.json()) as { version: number }).version,
    );
    await finish(draftJob);
    const sources = await getPool().query<{ material_id: string }>(
      `SELECT DISTINCT entry ->> 'materialId' AS material_id
         FROM article_drafts d, jsonb_array_elements(d.source_map) entry
        WHERE d.article_id = $1`,
      [articleId],
    );
    expect(sources.rows.map((row) => row.material_id)).toEqual([mine]);
  });

  it("lets an article from an idea pick or drop a framework", async () => {
    const owner = await signIn("framework-idea");
    const other = await signIn("framework-idea-other");
    const { articleId } = await confirmedArticle(owner);
    const { breakdownId } = await breakdown(owner);
    const { breakdownId: theirs } = await breakdown(other);
    const before = await detail(owner, articleId);
    expect(before.article.framework).toBeNull();

    const setFramework = (version: number, id: string | null) =>
      write(
        owner,
        `/articles/${articleId}/framework`,
        { expectedVersion: version, breakdownId: id },
        { method: "PUT" },
      );
    expect(
      await failure(await setFramework(before.article.version, theirs)),
    ).toMatchObject({ status: 404, code: "BREAKDOWN_NOT_FOUND" });
    const bound = await setFramework(before.article.version, breakdownId);
    expect(bound.status).toBe(200);
    const after = await detail(owner, articleId);
    // The old outline was planned without slots, so it is discarded.
    expect(after.article.outline).toBeNull();
    expect(after.article.breakdownId).toBe(breakdownId);
    expect(
      await failure(await setFramework(before.article.version, null)),
    ).toMatchObject({ status: 409, code: "ARTICLE_VERSION_CONFLICT" });
    const generated = await outline(owner, articleId, after.article.version);
    expect(generated.article.outline?.sections[0].slotId).toBe("slot1");
    const dropped = await setFramework(generated.article.version, null);
    expect(dropped.status).toBe(200);
    const plain = await detail(owner, articleId);
    expect(plain.article.framework).toBeNull();
    expect(plain.article.outline).toBeNull();
  });

  it("keeps the framework snapshot after the reference article is deleted", async () => {
    const owner = await signIn("framework-delete");
    const { referenceId, breakdownId } = await breakdown(owner);
    const mine = await material(
      owner,
      "真正拖慢我的不是时间，而是没有固定的开始动作。",
    );
    const created = await fromBreakdown(owner, breakdownId, [
      { id: mine, version: 1 },
    ]);
    const { articleId } = (await created.json()) as { articleId: string };
    const before = await detail(owner, articleId);

    const deleted = await app.request(`/api/breakdowns/${referenceId}`, {
      method: "DELETE",
      headers: { cookie: owner, origin },
    });
    expect(deleted.status).toBe(204);
    expect(
      (
        await app.request(`/api/breakdowns/${referenceId}`, {
          headers: { cookie: owner },
        })
      ).status,
    ).toBe(404);
    const { article } = await detail(owner, articleId);
    expect(article.breakdownId).toBeNull();
    expect(article.referenceArticleId).toBeNull();
    expect(article.framework).toEqual(before.article.framework);
    // The snapshot still drives slot outlines without the original.
    const generated = await outline(owner, articleId, article.version);
    expect(generated.article.outline?.sections.length).toBe(
      article.framework?.slots.length,
    );
  });
});
