import { randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";
import { afterAll, describe, expect, it } from "vitest";
import { createMockDraft } from "../../../worker/src/draft";
import {
  completeDraftJob,
  loadDraftContext,
} from "../../../worker/src/draft-jobs";
import { claimJob, processOneJob } from "../../../worker/src/jobs";
import { app } from "../../src/app";
import {
  cleanup,
  confirm,
  confirmedArticle,
  detail,
  failure,
  finish,
  generate,
  origin,
  signIn,
  write,
} from "./helpers";

describe("article drafts", () => {
  afterAll(cleanup);

  it("generates a sourced draft only from a confirmed outline", async () => {
    const owner = await signIn("draft-owner");
    const other = await signIn("draft-other");
    const { articleId } = await confirmedArticle(owner);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: 2 },
          { key: randomUUID() },
        ),
      ),
    ).toMatchObject({ status: 422, code: "OUTLINE_NOT_CONFIRMED" });
    const version = await confirm(owner, articleId);
    expect(
      (
        await write(
          other,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: version },
          { key: randomUUID() },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: version },
          { key: randomUUID(), source: "https://untrusted.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      await failure(
        await write(owner, `/articles/${articleId}/draft/generate`, {
          expectedVersion: version,
        }),
      ),
    ).toMatchObject({ status: 422, code: "INVALID_IDEMPOTENCY_KEY" });

    const key = randomUUID();
    const started = await write(
      owner,
      `/articles/${articleId}/draft/generate`,
      { expectedVersion: version },
      { key },
    );
    expect(started.status).toBe(202);
    const jobId = ((await started.json()) as { jobId: string }).jobId;
    const repeated = await write(
      owner,
      `/articles/${articleId}/draft/generate`,
      { expectedVersion: version },
      { key },
    );
    expect(((await repeated.json()) as { jobId: string }).jobId).toBe(jobId);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: version + 5 },
          { key },
        ),
      ),
    ).toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: version },
          { key: randomUUID() },
        ),
      ),
    ).toMatchObject({ status: 409, code: "DRAFT_JOB_ACTIVE" });

    await finish(jobId);
    const { article, latestDraftJob } = await detail(owner, articleId);
    expect(latestDraftJob).toMatchObject({ id: jobId, status: "succeeded" });
    expect(article.version).toBe(version + 1);
    expect(article.title).toBeTruthy();
    expect(article.body).toContain("## ");
    expect(article.currentDraft?.mode).toBe("mock");
    expect(article.currentDraft?.sourceMap.length).toBeGreaterThan(0);
    expect(
      article.currentDraft?.sourceMap.every(
        (entry) => entry.materialVersion === 1,
      ),
    ).toBe(true);
    expect(article.candidates).toEqual([]);
    expect(
      (
        await app.request(`/api/articles/${articleId}`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
  });

  it("keeps an existing body; regenerated drafts wait as candidates", async () => {
    const owner = await signIn("draft-candidate");
    const other = await signIn("draft-candidate-other");
    const { articleId } = await confirmedArticle(owner);
    const confirmedVersion = await confirm(owner, articleId);
    await finish(await generate(owner, articleId, confirmedVersion));
    const first = (await detail(owner, articleId)).article;

    await finish(await generate(owner, articleId, first.version));
    const withCandidate = (await detail(owner, articleId)).article;
    expect(withCandidate.version).toBe(first.version);
    expect(withCandidate.body).toBe(first.body);
    expect(withCandidate.candidates).toHaveLength(1);
    const candidate = withCandidate.candidates[0];

    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/drafts/${candidate.id}/apply`,
          { expectedVersion: first.version + 5 },
        ),
      ),
    ).toMatchObject({ status: 409, code: "ARTICLE_VERSION_CONFLICT" });
    expect(
      (
        await write(
          other,
          `/articles/${articleId}/drafts/${candidate.id}/apply`,
          {
            expectedVersion: first.version,
          },
        )
      ).status,
    ).toBe(404);
    const applied = await write(
      owner,
      `/articles/${articleId}/drafts/${candidate.id}/apply`,
      { expectedVersion: first.version },
    );
    expect(applied.status).toBe(200);
    const afterApply = (await detail(owner, articleId)).article;
    expect(afterApply.version).toBe(first.version + 1);
    expect(afterApply.currentDraft?.id).toBe(candidate.id);
    expect(afterApply.body).toBe(candidate.markdown);
    expect(afterApply.candidates).toEqual([]);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/drafts/${candidate.id}/apply`,
          {
            expectedVersion: afterApply.version,
          },
        ),
      ),
    ).toMatchObject({ status: 409, code: "DRAFT_NOT_CANDIDATE" });

    await finish(await generate(owner, articleId, afterApply.version));
    const next = (await detail(owner, articleId)).article.candidates[0];
    expect(
      (
        await write(
          other,
          `/articles/${articleId}/drafts/${next.id}/discard`,
          {},
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/drafts/${next.id}/discard`,
          {},
        )
      ).status,
    ).toBe(204);
    const afterDiscard = (await detail(owner, articleId)).article;
    expect(afterDiscard.candidates).toEqual([]);
    expect(afterDiscard.version).toBe(afterApply.version);
    expect(afterDiscard.body).toBe(afterApply.body);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/drafts/${next.id}/discard`,
          {},
        ),
      ),
    ).toMatchObject({ status: 409, code: "DRAFT_NOT_CANDIDATE" });
  });

  it("drops a claimed draft when the outline is edited and re-confirmed", async () => {
    const owner = await signIn("draft-stale");
    const { articleId } = await confirmedArticle(owner);
    const version = await confirm(owner, articleId);
    const jobId = await generate(owner, articleId, version);
    let claimed = await claimJob();
    while (claimed && claimed.id !== jobId) {
      await processOneJob();
      claimed = await claimJob();
    }
    expect(claimed?.id).toBe(jobId);
    if (!claimed) return;
    const context = await loadDraftContext(claimed);
    if (!context) throw new Error("Expected draft context");

    const current = (await detail(owner, articleId)).article;
    const edited = structuredClone(current.outline) as {
      sections: { heading: string }[];
    };
    edited.sections[0].heading = "作者改过的小节";
    expect(
      (
        await write(
          owner,
          `/articles/${articleId}/outline`,
          { expectedVersion: current.version, outline: edited },
          { method: "PUT" },
        )
      ).status,
    ).toBe(200);
    await confirm(owner, articleId);

    expect(await completeDraftJob(claimed, createMockDraft(context), 1)).toBe(
      "stale",
    );
    const after = (await detail(owner, articleId)).article;
    expect(after.body).toBeNull();
    expect(after.candidates).toEqual([]);
  });

  it("removes drafts with the article when a source material is deleted", async () => {
    const owner = await signIn("draft-delete");
    const { articleId, materialId } = await confirmedArticle(owner);
    await finish(
      await generate(owner, articleId, await confirm(owner, articleId)),
    );
    expect(
      (
        await app.request(`/api/materials/${materialId}`, {
          method: "DELETE",
          headers: { cookie: owner, origin },
        })
      ).status,
    ).toBe(204);
    const remaining = await getPool().query(
      "SELECT 1 FROM article_drafts WHERE article_id = $1",
      [articleId],
    );
    expect(remaining.rowCount).toBe(0);
  });
});
