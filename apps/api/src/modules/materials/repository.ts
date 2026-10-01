import { randomUUID } from "node:crypto";
import { getDb, getPool } from "@content-write/db/client";
import {
  linkFetchLimits,
  materialRevisions,
  materials,
} from "@content-write/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type MaterialInput = { title: string; content: string };
export type MaterialCreation = MaterialInput & {
  kind?: "text" | "markdown" | "link";
  sourceFilename?: string;
  sourceUrl?: string;
  fetchStatus?: "fetched" | "failed" | "disabled" | "manual";
};

export type MaterialFilters = {
  q?: string;
  kind?: "text" | "markdown" | "link";
  status?: "unprocessed" | "processing" | "failed" | "analyzed";
  tag?: string;
};

export async function listMaterials(userId: string, filters: MaterialFilters) {
  const result = await getPool().query<{
    id: string;
    title: string;
    kind: string;
    sourceFilename: string | null;
    sourceUrl: string | null;
    fetchStatus: string | null;
    currentVersion: number;
    createdAt: Date;
    updatedAt: Date;
    analysisStatus: string;
    tags: string[];
  }>(
    `SELECT m.id, m.title, m.kind, m.source_filename AS "sourceFilename", m.source_url AS "sourceUrl",
            m.fetch_status AS "fetchStatus", m.current_version AS "currentVersion",
            m.created_at AS "createdAt", m.updated_at AS "updatedAt",
            CASE WHEN a.id IS NOT NULL THEN 'analyzed'
                 WHEN j.status IN ('queued','running') THEN 'processing'
                 WHEN j.status = 'failed' THEN 'failed'
                 ELSE 'unprocessed' END AS "analysisStatus",
            COALESCE(a.result -> 'tags', '[]'::jsonb) AS tags
       FROM materials m
       LEFT JOIN material_analyses a ON a.material_id = m.id AND a.material_version = m.current_version
       LEFT JOIN LATERAL (
         SELECT status FROM ai_jobs WHERE material_id = m.id AND material_version = m.current_version
         ORDER BY created_at DESC, id DESC LIMIT 1
       ) j ON true
      WHERE m.user_id = $1
        AND ($2::text IS NULL OR position(lower($2) in lower(m.title || ' ' || m.content || ' ' || COALESCE(m.source_url, ''))) > 0)
        AND ($3::text IS NULL OR m.kind = $3)
        AND ($4::text IS NULL OR CASE WHEN a.id IS NOT NULL THEN 'analyzed'
               WHEN j.status IN ('queued','running') THEN 'processing'
               WHEN j.status = 'failed' THEN 'failed' ELSE 'unprocessed' END = $4)
        AND ($5::text IS NULL OR COALESCE(a.result -> 'tags', '[]'::jsonb) ? $5)
      ORDER BY m.updated_at DESC, m.id DESC LIMIT 101`,
    [
      userId,
      filters.q ?? null,
      filters.kind ?? null,
      filters.status ?? null,
      filters.tag ?? null,
    ],
  );
  return {
    materials: result.rows.slice(0, 100),
    hasMore: result.rows.length > 100,
  };
}

export async function getMaterial(userId: string, id: string) {
  const [item] = await getDb()
    .select()
    .from(materials)
    .where(and(eq(materials.id, id), eq(materials.userId, userId)))
    .limit(1);
  return item ?? null;
}

export async function createMaterial(userId: string, input: MaterialCreation) {
  return getDb().transaction(async (tx) => {
    const [item] = await tx
      .insert(materials)
      .values({
        id: randomUUID(),
        userId,
        ...input,
      })
      .returning();
    await tx.insert(materialRevisions).values({
      id: randomUUID(),
      materialId: item.id,
      userId,
      version: 1,
      ...input,
    });
    return item;
  });
}

export async function updateMaterial(
  userId: string,
  id: string,
  expectedVersion: number,
  input: MaterialInput,
) {
  return getDb().transaction(async (tx) => {
    const [item] = await tx
      .update(materials)
      .set({
        ...input,
        fetchStatus: sql`case when ${materials.kind} = 'link' then 'manual' else ${materials.fetchStatus} end`,
        currentVersion: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(materials.id, id),
          eq(materials.userId, userId),
          eq(materials.currentVersion, expectedVersion),
        ),
      )
      .returning();
    if (!item) {
      const [existing] = await tx
        .select({ id: materials.id })
        .from(materials)
        .where(and(eq(materials.id, id), eq(materials.userId, userId)))
        .limit(1);
      return existing
        ? { status: "conflict" as const }
        : { status: "missing" as const };
    }
    await tx.insert(materialRevisions).values({
      id: randomUUID(),
      materialId: id,
      userId,
      version: item.currentVersion,
      kind: item.kind,
      sourceFilename: item.sourceFilename,
      sourceUrl: item.sourceUrl,
      fetchStatus: item.fetchStatus,
      ...input,
    });
    return { status: "updated" as const, item };
  });
}

export async function allowLinkFetch(userId: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const [entry] = await getDb()
    .insert(linkFetchLimits)
    .values({ userId, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: linkFetchLimits.userId,
      set: {
        count: sql`case when ${linkFetchLimits.windowStart} <= ${cutoff} then 1 else ${linkFetchLimits.count} + 1 end`,
        windowStart: sql`case when ${linkFetchLimits.windowStart} <= ${cutoff} then ${now} else ${linkFetchLimits.windowStart} end`,
      },
    })
    .returning({ count: linkFetchLimits.count });
  return entry.count <= 10;
}

export async function deleteMaterial(userId: string, id: string) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Removing a selected source invalidates its entire generated result and pending job.
    await client.query(
      "DELETE FROM ai_jobs WHERE user_id = $1 AND id IN (SELECT job_id FROM idea_job_sources WHERE material_id = $2)",
      [userId, id],
    );
    await client.query(
      "DELETE FROM ideas WHERE user_id = $1 AND id IN (SELECT idea_id FROM idea_sources WHERE material_id = $2)",
      [userId, id],
    );
    const deleted = await client.query(
      "DELETE FROM materials WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, userId],
    );
    await client.query("COMMIT");
    return deleted.rowCount === 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
