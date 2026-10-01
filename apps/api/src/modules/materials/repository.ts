import { randomUUID } from "node:crypto";
import { getDb } from "@content-write/db/client";
import { materialRevisions, materials } from "@content-write/db/schema";
import { and, desc, eq } from "drizzle-orm";

export type MaterialInput = { title: string; content: string };
export type MaterialCreation = MaterialInput & {
  kind?: "text" | "markdown";
  sourceFilename?: string;
};

export async function listMaterials(userId: string) {
  return getDb()
    .select({
      id: materials.id,
      title: materials.title,
      kind: materials.kind,
      sourceFilename: materials.sourceFilename,
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
      ...input,
    });
    return { status: "updated" as const, item };
  });
}

export async function deleteMaterial(userId: string, id: string) {
  const [deleted] = await getDb()
    .delete(materials)
    .where(and(eq(materials.id, id), eq(materials.userId, userId)))
    .returning({ id: materials.id });
  return Boolean(deleted);
}
