import { getPool } from "@content-write/db/client";

export async function getJob(userId: string, jobId: string) {
  const result = await getPool().query<{
    id: string;
    kind: string;
    material_id: string | null;
    material_version: number | null;
    status: string;
    error_code: string | null;
    updated_at: Date;
    result: unknown;
    mode: string | null;
  }>(
    `SELECT j.id, j.kind, j.material_id, j.material_version, j.status, j.error_code, j.updated_at, a.result, a.mode
       FROM ai_jobs j LEFT JOIN material_analyses a ON j.kind = 'material_analysis' AND a.material_id = j.material_id AND a.material_version = j.material_version
      WHERE j.id = $1 AND j.user_id = $2`,
    [jobId, userId],
  );
  return result.rows[0] ?? null;
}
