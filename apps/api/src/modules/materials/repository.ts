import { randomUUID } from "node:crypto";
import { getDb } from "@content-write/db/client";
import {
  linkFetchLimits,
  materialRevisions,
  materials,
} from "@content-write/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export type MaterialInput = { title: string; content: string };
export type MaterialCreation = MaterialInput & {
  kind?: "text" | "markdown" | "link";
  sourceFilename?: string;
  sourceUrl?: string;
  fetchStatus?: "fetched" | "failed" | "disabled" | "manual";
};

export async function listMaterials(userId: string) {
  return getDb()
    .select({
      id: materials.id,
      title: materials.title,
      kind: materials.kind,
      sourceFilename: materials.sourceFilename,
      sourceUrl: materials.sourceUrl,
      fetchStatus: materials.fetchStatus,
      currentVersion: materials.currentVersion,
      createdAt: materials.createdAt,
      updatedAt: materials.updatedAt,
    })
    .from(materials)
    .where(eq(materials.userId, userId))
    .orderBy(desc(materials.updatedAt), desc(materials.id))
    .limit(100);
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
  const [deleted] = await getDb()
    .delete(materials)
    .where(and(eq(materials.id, id), eq(materials.userId, userId)))
    .returning({ id: materials.id });
  return Boolean(deleted);
}
