import { and, eq } from "drizzle-orm";
import type { Executor } from "./client";
import { authorProfileRevisions, authorProfiles } from "./schema";

export type AuthorProfile = {
  bio: string;
  topics: string[];
  audience: string;
  preferences: string;
  bannedWords: string[];
};

/** Current profile version, or null when the author has not saved one. */
export async function currentProfileVersion(db: Executor, userId: string) {
  const [row] = await db
    .select({ version: authorProfiles.version })
    .from(authorProfiles)
    .where(eq(authorProfiles.userId, userId));
  return row?.version ?? null;
}

/** The profile as it was at `version`; null for jobs queued without one. */
export async function readProfileRevision(
  db: Executor,
  userId: string,
  version: number | null,
): Promise<AuthorProfile | null> {
  if (version === null) return null;
  const [row] = await db
    .select({
      bio: authorProfileRevisions.bio,
      topics: authorProfileRevisions.topics,
      audience: authorProfileRevisions.audience,
      preferences: authorProfileRevisions.preferences,
      bannedWords: authorProfileRevisions.bannedWords,
    })
    .from(authorProfileRevisions)
    .where(
      and(
        eq(authorProfileRevisions.userId, userId),
        eq(authorProfileRevisions.version, version),
      ),
    );
  return row ?? null;
}

/** True when nothing in the profile would change a prompt. */
export function profileIsEmpty(profile: AuthorProfile | null) {
  return (
    !profile ||
    (!profile.bio &&
      !profile.topics.length &&
      !profile.audience &&
      !profile.preferences &&
      !profile.bannedWords.length)
  );
}
