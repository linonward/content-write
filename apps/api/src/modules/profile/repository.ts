import { randomUUID } from "node:crypto";
import type { AuthorProfile } from "@content-write/db/author-profile";
import type { Executor } from "@content-write/db/client";
import {
  authorProfileRevisions,
  authorProfiles,
} from "@content-write/db/schema";
import { and, eq, sql } from "drizzle-orm";

export async function findProfile(db: Executor, userId: string) {
  const [row] = await db
    .select({
      bio: authorProfiles.bio,
      topics: authorProfiles.topics,
      audience: authorProfiles.audience,
      preferences: authorProfiles.preferences,
      bannedWords: authorProfiles.bannedWords,
      version: authorProfiles.version,
      updatedAt: authorProfiles.updatedAt,
    })
    .from(authorProfiles)
    .where(eq(authorProfiles.userId, userId));
  return row;
}

/** Creates version 1; returns null when the author already has a profile. */
export async function insertProfile(
  db: Executor,
  userId: string,
  profile: AuthorProfile,
) {
  const [row] = await db
    .insert(authorProfiles)
    .values({ userId, ...profile, version: 1 })
    .onConflictDoNothing()
    .returning({ version: authorProfiles.version });
  return row?.version ?? null;
}

/** Writes the next version when `expectedVersion` is current; null otherwise. */
export async function updateProfile(
  db: Executor,
  userId: string,
  expectedVersion: number,
  profile: AuthorProfile,
) {
  const [row] = await db
    .update(authorProfiles)
    .set({
      ...profile,
      version: sql`${authorProfiles.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(authorProfiles.userId, userId),
        eq(authorProfiles.version, expectedVersion),
      ),
    )
    .returning({ version: authorProfiles.version });
  return row?.version ?? null;
}

export async function insertRevision(
  db: Executor,
  userId: string,
  version: number,
  profile: AuthorProfile,
) {
  await db
    .insert(authorProfileRevisions)
    .values({ id: randomUUID(), userId, version, ...profile });
}
