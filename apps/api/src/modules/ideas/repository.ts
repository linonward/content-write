import { getPool } from "@content-write/db/client";

export async function eligibleMaterials(userId: string) {
  const result = await getPool().query<{
    id: string;
    title: string;
    currentVersion: number;
    summary: string;
    tags: string[];
  }>(
    `SELECT m.id, m.title, m.current_version AS "currentVersion",
            a.result ->> 'summary' AS summary, COALESCE(a.result -> 'tags', '[]'::jsonb) AS tags
       FROM materials m JOIN material_analyses a
         ON a.material_id = m.id AND a.material_version = m.current_version
      WHERE m.user_id = $1 ORDER BY m.updated_at DESC, m.id DESC LIMIT 101`,
    [userId],
  );
  return {
    materials: result.rows.slice(0, 100),
    hasMore: result.rows.length > 100,
  };
}

export async function listIdeas(userId: string) {
  const pool = getPool();
  const [items, jobs] = await Promise.all([
    pool.query<{
      id: string;
      title: string;
      audience: string;
      thesis: string;
      rationale: string;
      evidenceGaps: string[];
      suggestedStructure: string[];
      status: string;
      mode: string;
      createdAt: Date;
      sources: {
        materialId: string;
        materialVersion: number;
        title: string;
        summary: string;
      }[];
    }>(
      `SELECT i.id, i.title, i.audience, i.thesis, i.rationale,
              i.evidence_gaps AS "evidenceGaps", i.suggested_structure AS "suggestedStructure",
              i.status, i.mode, i.created_at AS "createdAt",
              COALESCE(jsonb_agg(jsonb_build_object(
                'materialId', s.material_id, 'materialVersion', s.material_version,
                'title', r.title, 'summary', a.result ->> 'summary'
              ) ORDER BY s.material_id) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb) AS sources
         FROM ideas i LEFT JOIN idea_sources s ON s.idea_id = i.id
         LEFT JOIN material_revisions r ON r.material_id = s.material_id AND r.version = s.material_version
         LEFT JOIN material_analyses a ON a.material_id = s.material_id AND a.material_version = s.material_version
        WHERE i.user_id = $1 GROUP BY i.id ORDER BY i.created_at DESC, i.id DESC LIMIT 100`,
      [userId],
    ),
    pool.query<{ id: string; status: string; errorCode: string | null }>(
      `SELECT id, status, error_code AS "errorCode" FROM ai_jobs
        WHERE user_id = $1 AND kind = 'idea_generation'
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [userId],
    ),
  ]);
  return { ideas: items.rows, latestJob: jobs.rows[0] ?? null };
}

export async function setIdeaStatus(
  userId: string,
  ideaId: string,
  status: "new" | "saved" | "ignored",
) {
  const result = await getPool().query<{ id: string; status: string }>(
    "UPDATE ideas SET status = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id, status",
    [ideaId, userId, status],
  );
  return result.rows[0] ?? null;
}
