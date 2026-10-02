import { randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";
import { afterAll, describe, expect, it } from "vitest";
import { createMockEdit } from "../../../worker/src/edit";
import {
  completeEditJob,
  loadEditContext,
} from "../../../worker/src/edit-jobs";
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

type Suggestion = {
  id: string;
  scope: "selection" | "full";
  baseVersion: number;
  start: number;
  end: number;
  selectionText: string;
  instruction: string;
  replacement: string;
  explanation: string;
  evidenceGaps: string[];
  mode: string;
  stale: boolean;
};
type Suggestions = {
  suggestions: Suggestion[];
  latestJob: { id: string; status: string; errorCode: string | null } | null;
  generationAvailable: boolean;
};

/** An article whose first draft became the body. */
async function articleWithBody(cookie: string) {
  const { articleId, materialId } = await confirmedArticle(cookie);
  await finish(
    await generate(cookie, articleId, await confirm(cookie, articleId)),
  );
  const { article } = await detail(cookie, articleId);
  if (!article.body || !article.title) throw new Error("Expected a body");
  return {
    articleId,
    materialId,
    version: article.version,
    title: article.title,
    body: article.body,
  };
}

/** The first paragraph of the body as a selection. */
function firstParagraph(body: string) {
  const end = body.indexOf("\n\n");
  return { start: 0, end, selectionText: body.slice(0, end) };
}

function requestEdit(
  cookie: string,
  articleId: string,
  input: Record<string, unknown>,
  key = randomUUID(),
) {
  return write(cookie, `/articles/${articleId}/edit`, input, { key });
}

async function startEdit(
  cookie: string,
  articleId: string,
  input: Record<string, unknown>,
) {
  const response = await requestEdit(cookie, articleId, input);
  expect(response.status).toBe(202);
  return ((await response.json()) as { jobId: string }).jobId;
}

async function suggestions(cookie: string, articleId: string) {
  const response = await app.request(`/api/articles/${articleId}/suggestions`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Suggestions;
}

function saveBody(
  cookie: string,
  articleId: string,
  expectedVersion: number,
  title: string,
  body: string,
) {
  return write(
    cookie,
    `/articles/${articleId}/body`,
    { expectedVersion, title, body },
    { method: "PUT" },
  );
}

describe("AI edit suggestions", () => {
  afterAll(cleanup);

  it("validates the request and queues one idempotent job per article", async () => {
    const owner = await signIn("edit-request");
    const other = await signIn("edit-request-other");
    const { articleId, version, body } = await articleWithBody(owner);
    const selection = firstParagraph(body);
    const input = {
      expectedVersion: version,
      scope: "selection",
      ...selection,
      instruction: "更精简",
    };

    expect(
      await failure(await write(owner, `/articles/${articleId}/edit`, input)),
    ).toMatchObject({ status: 422, code: "INVALID_IDEMPOTENCY_KEY" });
    expect((await requestEdit(other, articleId, input)).status).toBe(404);
    expect(
      (
        await write(owner, `/articles/${articleId}/edit`, input, {
          key: randomUUID(),
          source: "https://untrusted.example",
        })
      ).status,
    ).toBe(403);
    expect(
      await failure(
        await requestEdit(owner, articleId, { ...input, end: input.start }),
      ),
    ).toMatchObject({ status: 422, code: "INVALID_EDIT_REQUEST" });
    expect(
      await failure(
        await requestEdit(owner, articleId, { ...input, instruction: " " }),
      ),
    ).toMatchObject({ status: 422, code: "INVALID_EDIT_REQUEST" });
    expect(
      await failure(
        await requestEdit(owner, articleId, {
          ...input,
          selectionText: `${selection.selectionText}x`,
        }),
      ),
    ).toMatchObject({ status: 409, code: "SELECTION_MISMATCH" });
    expect(
      await failure(
        await requestEdit(owner, articleId, {
          ...input,
          end: body.length + 10,
        }),
      ),
    ).toMatchObject({ status: 409, code: "SELECTION_MISMATCH" });
    expect(
      await failure(
        await requestEdit(owner, articleId, { ...input, scope: "full" }),
      ),
    ).toMatchObject({ status: 422, code: "INVALID_EDIT_SCOPE" });
    expect(
      await failure(
        await requestEdit(owner, articleId, {
          ...input,
          expectedVersion: version + 5,
        }),
      ),
    ).toMatchObject({ status: 409, code: "ARTICLE_VERSION_CONFLICT" });

    const key = randomUUID();
    const started = await requestEdit(owner, articleId, input, key);
    expect(started.status).toBe(202);
    const jobId = ((await started.json()) as { jobId: string }).jobId;
    const repeated = await requestEdit(owner, articleId, input, key);
    expect(((await repeated.json()) as { jobId: string }).jobId).toBe(jobId);
    expect(
      await failure(
        await requestEdit(
          owner,
          articleId,
          { ...input, instruction: "更口语" },
          key,
        ),
      ),
    ).toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(
      await failure(await requestEdit(owner, articleId, input)),
    ).toMatchObject({ status: 409, code: "EDIT_JOB_ACTIVE" });

    const job = await app.request(`/api/jobs/${jobId}`, {
      headers: { cookie: owner },
    });
    expect(((await job.json()) as { job: { kind: string } }).job.kind).toBe(
      "edit_suggestion",
    );
    expect(
      (
        await app.request(`/api/articles/${articleId}/suggestions`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
  });

  it("refuses edits before a body exists and selections over the limit", async () => {
    const owner = await signIn("edit-limits");
    const { articleId } = await confirmedArticle(owner);
    const { article } = await detail(owner, articleId);
    expect(
      await failure(
        await requestEdit(owner, articleId, {
          expectedVersion: article.version,
          scope: "selection",
          start: 0,
          end: 1,
          selectionText: "x",
          instruction: "更精简",
        }),
      ),
    ).toMatchObject({ status: 422, code: "ARTICLE_BODY_REQUIRED" });

    const long = "长".repeat(8_001);
    const saved = await saveBody(
      owner,
      articleId,
      article.version,
      "长文",
      `${long}\n\n   \n\n结尾`,
    );
    expect(saved.status).toBe(200);
    const { version } = (await saved.json()) as { version: number };
    expect(
      await failure(
        await requestEdit(owner, articleId, {
          expectedVersion: version,
          scope: "selection",
          start: 0,
          end: long.length,
          selectionText: long,
          instruction: "更精简",
        }),
      ),
    ).toMatchObject({ status: 413, code: "SELECTION_TOO_LARGE" });
    const body = `${long}\n\n   \n\n结尾`;
    expect(
      await failure(
        await requestEdit(owner, articleId, {
          expectedVersion: version,
          scope: "full",
          start: 0,
          end: body.length,
          selectionText: body,
          instruction: "更精简",
        }),
      ),
    ).toMatchObject({ status: 413, code: "SELECTION_TOO_LARGE" });
    const blankStart = long.length + 2;
    expect(
      await failure(
        await requestEdit(owner, articleId, {
          expectedVersion: version,
          scope: "selection",
          start: blankStart,
          end: blankStart + 3,
          selectionText: "   ",
          instruction: "更精简",
        }),
      ),
    ).toMatchObject({ status: 422, code: "INVALID_EDIT_REQUEST" });
  });

  it("shows a ready suggestion as a candidate and applies it once", async () => {
    const owner = await signIn("edit-apply");
    const other = await signIn("edit-apply-other");
    const { articleId, version, body } = await articleWithBody(owner);
    const selection = firstParagraph(body);
    const jobId = await startEdit(owner, articleId, {
      expectedVersion: version,
      scope: "selection",
      ...selection,
      instruction: "更精简",
    });
    await finish(jobId);

    const listed = await suggestions(owner, articleId);
    expect(listed.latestJob).toMatchObject({ id: jobId, status: "succeeded" });
    expect(listed.suggestions).toHaveLength(1);
    const [suggestion] = listed.suggestions;
    expect(suggestion).toMatchObject({
      scope: "selection",
      baseVersion: version,
      start: selection.start,
      end: selection.end,
      selectionText: selection.selectionText,
      instruction: "更精简",
      mode: "mock",
      stale: false,
    });
    expect(suggestion.replacement).not.toBe(selection.selectionText);
    expect(suggestion.explanation).toBeTruthy();
    // The candidate leaves the body alone until the author applies it.
    const untouched = (await detail(owner, articleId)).article;
    expect(untouched.version).toBe(version);
    expect(untouched.body).toBe(body);

    const applyPath = `/articles/${articleId}/suggestions/${suggestion.id}/apply`;
    expect(
      await failure(
        await write(other, applyPath, { expectedVersion: version }),
      ),
    ).toMatchObject({ status: 404, code: "SUGGESTION_NOT_FOUND" });
    expect(
      await failure(
        await write(owner, applyPath, { expectedVersion: version + 1 }),
      ),
    ).toMatchObject({ status: 409, code: "ARTICLE_VERSION_CONFLICT" });
    const applied = await write(owner, applyPath, { expectedVersion: version });
    expect(applied.status).toBe(200);
    expect(await applied.json()).toEqual({ version: version + 1 });
    const expected = suggestion.replacement + body.slice(selection.end);
    const after = (await detail(owner, articleId)).article;
    expect(after.version).toBe(version + 1);
    expect(after.body).toBe(expected);

    // A repeated apply (double click, retried request) changes nothing.
    const again = await write(owner, applyPath, { expectedVersion: version });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ version: version + 1 });
    expect((await detail(owner, articleId)).article.version).toBe(version + 1);

    const revisions = await app.request(
      `/api/articles/${articleId}/revisions`,
      {
        headers: { cookie: owner },
      },
    );
    const history = (
      (await revisions.json()) as {
        revisions: { version: number; source: string }[];
      }
    ).revisions;
    expect(history[0]).toMatchObject({
      version: version + 1,
      source: "ai_edit",
    });
    expect((await suggestions(owner, articleId)).suggestions).toEqual([]);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/suggestions/${suggestion.id}/reject`,
          {},
        ),
      ),
    ).toMatchObject({ status: 409, code: "SUGGESTION_CLOSED" });
  });

  it("marks suggestions stale once the body changes; they can only be rejected", async () => {
    const owner = await signIn("edit-stale");
    const { articleId, version, title, body } = await articleWithBody(owner);
    await finish(
      await startEdit(owner, articleId, {
        expectedVersion: version,
        scope: "full",
        start: 0,
        end: body.length,
        selectionText: body,
        instruction: "整体更口语",
      }),
    );
    const [suggestion] = (await suggestions(owner, articleId)).suggestions;
    expect(suggestion).toMatchObject({ scope: "full", stale: false });

    const saved = await saveBody(
      owner,
      articleId,
      version,
      title,
      `${body}\n\n作者补的一句。`,
    );
    expect(saved.status).toBe(200);
    const { version: edited } = (await saved.json()) as { version: number };
    expect((await suggestions(owner, articleId)).suggestions[0]).toMatchObject({
      id: suggestion.id,
      stale: true,
    });
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/suggestions/${suggestion.id}/apply`,
          { expectedVersion: edited },
        ),
      ),
    ).toMatchObject({ status: 409, code: "SUGGESTION_STALE" });

    const rejectPath = `/articles/${articleId}/suggestions/${suggestion.id}/reject`;
    expect((await write(owner, rejectPath, {})).status).toBe(204);
    expect((await write(owner, rejectPath, {})).status).toBe(204);
    expect((await suggestions(owner, articleId)).suggestions).toEqual([]);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/suggestions/${suggestion.id}/apply`,
          { expectedVersion: edited },
        ),
      ),
    ).toMatchObject({ status: 409, code: "SUGGESTION_CLOSED" });
    expect((await detail(owner, articleId)).article.version).toBe(edited);
  });

  it("rejects an apply that would push the body over the limit", async () => {
    const owner = await signIn("edit-oversize");
    const { articleId, version, title } = await articleWithBody(owner);
    const body = `开头一句话。\n\n${"满".repeat(49_990)}`;
    const saved = await saveBody(owner, articleId, version, title, body);
    expect(saved.status).toBe(200);
    const { version: full } = (await saved.json()) as { version: number };
    await finish(
      await startEdit(owner, articleId, {
        expectedVersion: full,
        scope: "selection",
        start: 0,
        end: 6,
        selectionText: "开头一句话。",
        instruction: "展开说明",
      }),
    );
    const [suggestion] = (await suggestions(owner, articleId)).suggestions;
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/suggestions/${suggestion.id}/apply`,
          { expectedVersion: full },
        ),
      ),
    ).toMatchObject({ status: 413, code: "ARTICLE_BODY_TOO_LARGE" });
    expect((await detail(owner, articleId)).article.body).toBe(body);
  });

  it("drops a claimed suggestion when the body changes during generation", async () => {
    const owner = await signIn("edit-race");
    const { articleId, version, title, body } = await articleWithBody(owner);
    const jobId = await startEdit(owner, articleId, {
      expectedVersion: version,
      scope: "selection",
      ...firstParagraph(body),
      instruction: "更精简",
    });
    let claimed = await claimJob();
    while (claimed && claimed.id !== jobId) {
      await processOneJob();
      claimed = await claimJob();
    }
    expect(claimed?.id).toBe(jobId);
    if (!claimed) return;
    const context = await loadEditContext(claimed);
    if (!context) throw new Error("Expected edit context");

    expect(
      (await saveBody(owner, articleId, version, title, `${body}\n\n新增`))
        .status,
    ).toBe(200);
    expect(await completeEditJob(claimed, createMockEdit(context), 1)).toBe(
      "stale",
    );
    const after = await suggestions(owner, articleId);
    expect(after.suggestions).toEqual([]);
    expect(after.latestJob).toMatchObject({ id: jobId, status: "stale" });
    expect(await loadEditContext(claimed)).toBeNull();
  });

  it("removes suggestions with the article when a source material is deleted", async () => {
    const owner = await signIn("edit-delete");
    const { articleId, materialId, version, body } =
      await articleWithBody(owner);
    await finish(
      await startEdit(owner, articleId, {
        expectedVersion: version,
        scope: "selection",
        ...firstParagraph(body),
        instruction: "更精简",
      }),
    );
    const deleted = await app.request(`/api/materials/${materialId}`, {
      method: "DELETE",
      headers: { cookie: owner, origin },
    });
    expect(deleted.status).toBe(204);
    const remaining = await getPool().query(
      "SELECT 1 FROM edit_suggestions WHERE article_id = $1",
      [articleId],
    );
    expect(remaining.rowCount).toBe(0);
  });
});
