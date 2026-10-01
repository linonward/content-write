import { randomUUID } from "node:crypto";
import { getPool } from "@content-write/db/client";
import { type GeneratedIdea, type IdeaSource, validateIdeas } from "./ideas";
import type { Claimed } from "./jobs";

export async function loadIdeaSources(
  job: Claimed,
): Promise<IdeaSource[] | null> {
  const result = await getPool().query<{
    id: string;
    title: string;
    version: number;
    current_version: number;
    summary: string | null;
    angle: string | null;
    claim: string | null;
  }>(
    `SELECT s.material_id AS id, m.title, s.material_version AS version,
            m.current_version, a.result ->> 'summary' AS summary,
            a.result #>> '{angles,0,title}' AS angle,
            a.result #>> '{claims,0,text}' AS claim
       FROM idea_job_sources s JOIN materials m ON m.id = s.material_id AND m.user_id = $2
       LEFT JOIN material_analyses a ON a.material_id = s.material_id AND a.material_version = s.material_version
      WHERE s.job_id = $1 ORDER BY s.material_id`,
    [job.id, job.user_id],
  );
  if (
    result.rows.length !== job.source_count ||
    result.rows.some(
      (row) => row.current_version !== row.version || !row.summary,
    )
  )
    return null;
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    version: row.version,
    summary: row.summary ?? "",
    angle: row.angle ?? row.title,
    claim: row.claim ?? row.summary ?? "",
  }));
}

export async function completeIdeaJob(
  job: Claimed,
  output: GeneratedIdea[],
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
    const selected = await client.query<{
      material_id: string;
      material_version: number;
    }>(
      "SELECT material_id, material_version FROM idea_job_sources WHERE job_id = $1 ORDER BY material_id",
      [job.id],
    );
    if (selected.rows.length !== job.source_count) {
      await client.query(
        "UPDATE ai_jobs SET status = 'stale', error_code = 'SOURCE_DELETED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
        [job.id],
      );
      await client.query("COMMIT");
      return "stale" as const;
    }
    const sources: IdeaSource[] = [];
    for (const source of selected.rows) {
      const current = await client.query<{
        title: string;
        current_version: number;
        summary: string | null;
      }>(
        `SELECT m.title, m.current_version, a.result ->> 'summary' AS summary
           FROM materials m LEFT JOIN material_analyses a
             ON a.material_id = m.id AND a.material_version = $3
          WHERE m.id = $1 AND m.user_id = $2 FOR UPDATE OF m`,
        [source.material_id, job.user_id, source.material_version],
      );
      if (
        !current.rows[0] ||
        current.rows[0].current_version !== source.material_version ||
        !current.rows[0].summary
      ) {
        await client.query(
          "UPDATE ai_jobs SET status = 'stale', error_code = 'SOURCE_VERSION_CHANGED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
          [job.id],
        );
        await client.query("COMMIT");
        return "stale" as const;
      }
      sources.push({
        id: source.material_id,
        title: current.rows[0].title,
        version: source.material_version,
        summary: current.rows[0].summary,
        angle: "",
        claim: "",
      });
    }
    const parsed = validateIdeas(output, sources);
    if (!parsed.success) throw new Error("Invalid source-based idea output");
    for (const idea of parsed.data) {
      const ideaId = randomUUID();
      await client.query(
        `INSERT INTO ideas (id, user_id, job_id, title, audience, thesis, rationale, evidence_gaps, suggested_structure, mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,'mock')`,
        [
          ideaId,
          job.user_id,
          job.id,
          idea.title,
          idea.audience,
          idea.thesis,
          idea.rationale,
          JSON.stringify(idea.evidenceGaps),
          JSON.stringify(idea.suggestedStructure),
        ],
      );
      for (const materialId of idea.materialIds) {
        const source = selected.rows.find(
          (item) => item.material_id === materialId,
        );
        if (!source) throw new Error("Unselected idea source");
        await client.query(
          "INSERT INTO idea_sources (id, idea_id, material_id, material_version) VALUES ($1,$2,$3,$4)",
          [randomUUID(), ideaId, materialId, source.material_version],
        );
      }
    }
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
