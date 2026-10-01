import { randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";
import type { Claimed } from "./jobs";
import {
  type Brief,
  type Outline,
  type OutlineSource,
  validateOutline,
} from "./outline";

export async function loadOutlineContext(
  job: Claimed,
): Promise<{ brief: Brief; sources: OutlineSource[] } | null> {
  if (!job.article_id || !job.article_version) return null;
  const article = await getPool().query<{
    working_title: string;
    audience: string;
    thesis: string;
    version: number;
    source_count: number;
  }>(
    "SELECT working_title, audience, thesis, version, source_count FROM articles WHERE id = $1 AND user_id = $2",
    [job.article_id, job.user_id],
  );
  if (!article.rows[0] || article.rows[0].version !== job.article_version)
    return null;
  const sources = await getPool().query<{
    id: string;
    title: string | null;
    summary: string | null;
    evidenceSpans: { id: string }[] | null;
  }>(
    `SELECT s.material_id AS id, r.title, a.result ->> 'summary' AS summary,
            a.result -> 'evidenceSpans' AS "evidenceSpans"
       FROM article_sources s JOIN materials m ON m.id = s.material_id AND m.user_id = $2
       LEFT JOIN material_revisions r ON r.material_id = s.material_id AND r.version = s.material_version
       LEFT JOIN material_analyses a ON a.material_id = s.material_id AND a.material_version = s.material_version
      WHERE s.article_id = $1 ORDER BY s.material_id`,
    [job.article_id, job.user_id],
  );
  if (
    sources.rows.length !== job.source_count ||
    sources.rows.length !== article.rows[0].source_count ||
    sources.rows.some((source) => !source.title || !source.summary)
  )
    return null;
  return {
    brief: {
      workingTitle: article.rows[0].working_title,
      audience: article.rows[0].audience,
      thesis: article.rows[0].thesis,
    },
    sources: sources.rows.map((source) => ({
      id: source.id,
      title: source.title ?? "",
      summary: source.summary ?? "",
      evidenceIds: (source.evidenceSpans ?? []).map((span) => span.id),
    })),
  };
}

export async function completeOutlineJob(
  job: Claimed,
  output: Outline,
  durationMs: number,
) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(
      "SELECT id FROM ai_jobs WHERE id = $1 AND claim_token = $2 AND status = 'running' AND lease_until > now() AND deadline_at > now() FOR UPDATE",
      [job.id, job.claim_token],
    );
    if (!owned.rowCount) {
      await client.query("ROLLBACK");
      return "lost" as const;
    }
    const article = await client.query<{
      version: number;
      source_count: number;
    }>(
      "SELECT version, source_count FROM articles WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [job.article_id, job.user_id],
    );
    const sources = await client.query<{
      id: string;
      title: string | null;
      summary: string | null;
      evidenceSpans: { id: string }[] | null;
    }>(
      `SELECT s.material_id AS id, r.title, a.result ->> 'summary' AS summary,
              a.result -> 'evidenceSpans' AS "evidenceSpans"
         FROM article_sources s JOIN materials m ON m.id = s.material_id AND m.user_id = $2
         LEFT JOIN material_revisions r ON r.material_id = s.material_id AND r.version = s.material_version
         LEFT JOIN material_analyses a ON a.material_id = s.material_id AND a.material_version = s.material_version
        WHERE s.article_id = $1 ORDER BY s.material_id FOR UPDATE OF m`,
      [job.article_id, job.user_id],
    );
    if (
      !article.rows[0] ||
      article.rows[0].version !== job.article_version ||
      sources.rows.length !== job.source_count ||
      sources.rows.length !== article.rows[0].source_count ||
      sources.rows.some((source) => !source.title || !source.summary)
    ) {
      await client.query(
        "UPDATE ai_jobs SET status = 'stale', error_code = 'ARTICLE_OR_SOURCE_CHANGED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
        [job.id],
      );
      await client.query("COMMIT");
      return "stale" as const;
    }
    const checked = validateOutline(
      output,
      sources.rows.map((source) => ({
        id: source.id,
        title: source.title ?? "",
        summary: source.summary ?? "",
        evidenceIds: (source.evidenceSpans ?? []).map((span) => span.id),
      })),
    );
    if (!checked.success) throw new Error("Invalid outline output");
    await client.query(
      "UPDATE articles SET outline = $2::jsonb, outline_confirmed_at = NULL, version = version + 1, updated_at = now() WHERE id = $1",
      [job.article_id, JSON.stringify(checked.data)],
    );
    await client.query(
      "UPDATE ai_jobs SET status = 'succeeded', error_code = NULL, claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
      [job.id],
    );
    await client.query(
      "INSERT INTO ai_runs (id, job_id, user_id, mode, duration_ms) VALUES ($1,$2,$3,'mock',$4)",
      [randomUUID(), job.id, job.user_id, Math.max(0, Math.round(durationMs))],
    );
    await client.query("COMMIT");
    return "succeeded" as const;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
