import { createHash, randomUUID } from "node:crypto";
import { getPool, type PoolClient } from "@content-write/db/client";

export type Outline = {
  workingTitle: string;
  audience: string;
  thesis: string;
  sections: {
    heading: string;
    purpose: string;
    keyPoints: string[];
    evidenceIds: string[];
    missingEvidence: string[];
  }[];
};

function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export async function createArticle(userId: string, ideaId: string) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const idea = await client.query<{
      id: string;
      title: string;
      audience: string;
      thesis: string;
    }>(
      "SELECT id, title, audience, thesis FROM ideas WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [ideaId, userId],
    );
    if (!idea.rows[0]) {
      await client.query("ROLLBACK");
      return { status: "missing" as const };
    }
    const sources = await client.query<{
      material_id: string;
      material_version: number;
    }>(
      `SELECT s.material_id, s.material_version FROM idea_sources s
         JOIN materials m ON m.id = s.material_id AND m.user_id = $2 AND m.current_version = s.material_version
         JOIN material_analyses a ON a.material_id = s.material_id AND a.material_version = s.material_version
        WHERE s.idea_id = $1 ORDER BY s.material_id FOR UPDATE OF m`,
      [ideaId, userId],
    );
    if (!sources.rows.length) {
      await client.query("ROLLBACK");
      return { status: "stale" as const };
    }
    const total = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM idea_sources WHERE idea_id = $1",
      [ideaId],
    );
    if (Number(total.rows[0]?.count) !== sources.rows.length) {
      await client.query("ROLLBACK");
      return { status: "stale" as const };
    }
    const articleId = randomUUID();
    const created = await client.query<{ id: string }>(
      `INSERT INTO articles (id, user_id, idea_id, working_title, audience, thesis, source_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id, idea_id) DO NOTHING RETURNING id`,
      [
        articleId,
        userId,
        ideaId,
        idea.rows[0].title,
        idea.rows[0].audience,
        idea.rows[0].thesis,
        sources.rows.length,
      ],
    );
    if (created.rows[0]) {
      for (const source of sources.rows)
        await client.query(
          "INSERT INTO article_sources (id, article_id, material_id, material_version) VALUES ($1,$2,$3,$4)",
          [
            randomUUID(),
            articleId,
            source.material_id,
            source.material_version,
          ],
        );
    }
    const id =
      created.rows[0]?.id ??
      (
        await client.query<{ id: string }>(
          "SELECT id FROM articles WHERE user_id = $1 AND idea_id = $2",
          [userId, ideaId],
        )
      ).rows[0]?.id;
    await client.query("COMMIT");
    return {
      status: created.rows[0] ? ("created" as const) : ("existing" as const),
      id,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listArticles(userId: string) {
  const result = await getPool().query(
    `SELECT id, idea_id AS "ideaId", working_title AS "workingTitle", audience, thesis, version,
            outline IS NOT NULL AS "hasOutline", outline_confirmed_at AS "outlineConfirmedAt", updated_at AS "updatedAt"
       FROM articles WHERE user_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 100`,
    [userId],
  );
  return { articles: result.rows };
}

export async function getArticle(userId: string, id: string) {
  const [article, sources, job] = await Promise.all([
    getPool().query<{
      id: string;
      ideaId: string | null;
      workingTitle: string;
      audience: string;
      thesis: string;
      sourceCount: number;
      version: number;
      outline: Outline | null;
      outlineConfirmedAt: Date | null;
      updatedAt: Date;
    }>(
      `SELECT id, idea_id AS "ideaId", working_title AS "workingTitle", audience, thesis, source_count AS "sourceCount", version, outline,
              outline_confirmed_at AS "outlineConfirmedAt", updated_at AS "updatedAt"
         FROM articles WHERE id = $1 AND user_id = $2`,
      [id, userId],
    ),
    getPool().query(
      `SELECT s.material_id AS "materialId", s.material_version AS "materialVersion", r.title,
              a.result ->> 'summary' AS summary, COALESCE(a.result -> 'evidenceSpans', '[]'::jsonb) AS "evidenceSpans"
         FROM article_sources s JOIN articles ar ON ar.id = s.article_id AND ar.user_id = $2
         LEFT JOIN material_revisions r ON r.material_id = s.material_id AND r.version = s.material_version
         LEFT JOIN material_analyses a ON a.material_id = s.material_id AND a.material_version = s.material_version
        WHERE s.article_id = $1 ORDER BY s.material_id`,
      [id, userId],
    ),
    getPool().query(
      `SELECT j.id, j.status, j.error_code AS "errorCode" FROM ai_jobs j
        WHERE j.article_id = $1 AND j.user_id = $2 AND j.kind = 'outline_generation'
        ORDER BY j.created_at DESC, j.id DESC LIMIT 1`,
      [id, userId],
    ),
  ]);
  if (!article.rows[0]) return null;
  return {
    article: { ...article.rows[0], sources: sources.rows },
    latestJob: job.rows[0] ?? null,
    generationAvailable: process.env.AI_MODE === "mock",
  };
}

async function lockedArticle(client: PoolClient, userId: string, id: string) {
  const result = await client.query<{
    version: number;
    outline: Outline | null;
    outline_confirmed_at: Date | null;
  }>(
    "SELECT version, outline, outline_confirmed_at FROM articles WHERE id = $1 AND user_id = $2 FOR UPDATE",
    [id, userId],
  );
  return result.rows[0];
}

export async function updateBrief(
  userId: string,
  id: string,
  expectedVersion: number,
  brief: { workingTitle: string; audience: string; thesis: string },
) {
  const result = await getPool().query(
    `UPDATE articles SET working_title = $4, audience = $5, thesis = $6, outline = NULL,
            outline_confirmed_at = NULL, version = version + 1, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND version = $3 RETURNING version`,
    [
      id,
      userId,
      expectedVersion,
      brief.workingTitle,
      brief.audience,
      brief.thesis,
    ],
  );
  if (result.rows[0])
    return {
      status: "updated" as const,
      version: result.rows[0].version as number,
    };
  return {
    status: (
      await getPool().query(
        "SELECT 1 FROM articles WHERE id = $1 AND user_id = $2",
        [id, userId],
      )
    ).rowCount
      ? ("conflict" as const)
      : ("missing" as const),
  };
}

export async function saveOutline(
  userId: string,
  id: string,
  expectedVersion: number,
  outline: Outline,
) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const article = await lockedArticle(client, userId, id);
    if (!article) {
      await client.query("ROLLBACK");
      return { status: "missing" as const };
    }
    if (article.version !== expectedVersion) {
      await client.query("ROLLBACK");
      return { status: "conflict" as const };
    }
    const evidence = await client.query<{
      material_id: string;
      result: { evidenceSpans?: { id: string }[] } | null;
    }>(
      `SELECT s.material_id, a.result FROM article_sources s
         LEFT JOIN material_analyses a ON a.material_id = s.material_id AND a.material_version = s.material_version
        WHERE s.article_id = $1`,
      [id],
    );
    const count = await client.query<{ source_count: number }>(
      "SELECT source_count FROM articles WHERE id = $1",
      [id],
    );
    if (
      evidence.rows.length !== count.rows[0]?.source_count ||
      evidence.rows.some((row) => !row.result)
    ) {
      await client.query("ROLLBACK");
      return { status: "sources_missing" as const };
    }
    const available = new Set(
      evidence.rows.flatMap((row) =>
        (row.result?.evidenceSpans ?? []).map(
          (span) => `${row.material_id}:${span.id}`,
        ),
      ),
    );
    if (
      outline.sections.some((section) =>
        section.evidenceIds.some(
          (evidenceId) =>
            !available.has(evidenceId) ||
            new Set(section.evidenceIds).size !== section.evidenceIds.length,
        ),
      )
    ) {
      await client.query("ROLLBACK");
      return { status: "invalid_evidence" as const };
    }
    const result = await client.query<{ version: number }>(
      `UPDATE articles SET working_title = $2, audience = $3, thesis = $4, outline = $5::jsonb,
              outline_confirmed_at = NULL, version = version + 1, updated_at = now()
        WHERE id = $1 RETURNING version`,
      [
        id,
        outline.workingTitle,
        outline.audience,
        outline.thesis,
        JSON.stringify(outline),
      ],
    );
    await client.query("COMMIT");
    return { status: "updated" as const, version: result.rows[0].version };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmOutline(
  userId: string,
  id: string,
  expectedVersion: number,
) {
  const result = await getPool().query<{ version: number }>(
    `UPDATE articles SET outline_confirmed_at = now(), version = version + 1, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND version = $3 AND outline IS NOT NULL
        AND source_count = (SELECT count(*) FROM article_sources WHERE article_id = $1)
      RETURNING version`,
    [id, userId, expectedVersion],
  );
  if (result.rows[0])
    return { status: "confirmed" as const, version: result.rows[0].version };
  const article = await getPool().query<{
    version: number;
    outline: Outline | null;
    source_count: number;
    actual_count: string;
  }>(
    "SELECT version, outline, source_count, (SELECT count(*)::text FROM article_sources WHERE article_id = $1) AS actual_count FROM articles WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  if (!article.rows[0]) return { status: "missing" as const };
  if (article.rows[0].version !== expectedVersion)
    return { status: "conflict" as const };
  if (Number(article.rows[0].actual_count) !== article.rows[0].source_count)
    return { status: "sources_missing" as const };
  return { status: "no_outline" as const };
}

export async function startOutlineGeneration(
  userId: string,
  id: string,
  expectedVersion: number,
  key: string,
) {
  if (process.env.AI_MODE !== "mock") return { status: "unavailable" as const };
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
    const article = await client.query<{
      version: number;
      source_count: number;
    }>(
      "SELECT version, source_count FROM articles WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [id, userId],
    );
    if (!article.rows[0]) {
      await client.query("ROLLBACK");
      return { status: "missing" as const };
    }
    const sources = await client.query<{
      material_id: string;
      material_version: number;
    }>(
      `SELECT s.material_id, s.material_version FROM article_sources s
         JOIN materials m ON m.id = s.material_id AND m.user_id = $2
         JOIN material_analyses a ON a.material_id = s.material_id AND a.material_version = s.material_version
        WHERE s.article_id = $1 ORDER BY s.material_id FOR UPDATE OF m`,
      [id, userId],
    );
    if (
      !sources.rows.length ||
      sources.rows.length !== article.rows[0].source_count
    ) {
      await client.query("ROLLBACK");
      return { status: "sources_missing" as const };
    }
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          kind: "outline_generation",
          id,
          expectedVersion,
          sources: sources.rows,
          mode: "mock",
        }),
      )
      .digest("hex");
    const prior = await client.query<{ id: string; input_hash: string }>(
      "SELECT id, input_hash FROM ai_jobs WHERE user_id = $1 AND idempotency_key = $2",
      [userId, key],
    );
    if (prior.rows[0]) {
      await client.query("COMMIT");
      return prior.rows[0].input_hash === hash
        ? { status: "existing" as const, jobId: prior.rows[0].id }
        : { status: "conflict" as const };
    }
    if (article.rows[0].version !== expectedVersion) {
      await client.query("ROLLBACK");
      return { status: "version_conflict" as const };
    }
    await client.query(
      "UPDATE ai_jobs SET status = 'failed', error_code = 'DEADLINE_EXCEEDED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE user_id = $1 AND status IN ('queued','running') AND deadline_at <= now()",
      [userId],
    );
    const usage = await client.query<{ daily: string; active: string }>(
      `SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')::text AS daily,
              count(*) FILTER (WHERE status IN ('queued','running'))::text AS active FROM ai_jobs WHERE user_id = $1`,
      [userId],
    );
    if (Number(usage.rows[0]?.daily) >= limit("AI_DAILY_JOB_LIMIT", 20)) {
      await client.query("COMMIT");
      return { status: "quota" as const };
    }
    if (Number(usage.rows[0]?.active) >= limit("AI_USER_CONCURRENCY", 2)) {
      await client.query("COMMIT");
      return { status: "concurrency" as const };
    }
    const active = await client.query(
      "SELECT 1 FROM ai_jobs WHERE article_id = $1 AND kind = 'outline_generation' AND status IN ('queued','running') LIMIT 1",
      [id],
    );
    if (active.rowCount) {
      await client.query("COMMIT");
      return { status: "active" as const };
    }
    const jobId = randomUUID();
    await client.query(
      `INSERT INTO ai_jobs (id, user_id, material_id, material_version, source_count, article_id, article_version, kind, status, idempotency_key, input_hash, deadline_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'outline_generation','queued',$8,$9,now() + interval '5 minutes')`,
      [
        jobId,
        userId,
        sources.rows[0].material_id,
        sources.rows[0].material_version,
        sources.rows.length,
        id,
        expectedVersion,
        key,
        hash,
      ],
    );
    await client.query("COMMIT");
    return { status: "created" as const, jobId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
