import type { AuthorProfile } from "@content-write/db/author-profile";
import { getDb } from "@content-write/db/client";
import * as repo from "./repository";

export class ProfileError extends Error {
  constructor(readonly reason: "version_conflict") {
    super(reason);
    this.name = "ProfileError";
  }
}

const empty: AuthorProfile = {
  bio: "",
  topics: [],
  audience: "",
  preferences: "",
  bannedWords: [],
};

/** Version 0 means the author has not saved a profile yet. */
export async function getProfile(userId: string) {
  const profile = await repo.findProfile(getDb(), userId);
  return profile ?? { ...empty, version: 0, updatedAt: null };
}

/**
 * Saves the profile as a new version with a snapshot. Generations queued
 * earlier keep the version they recorded, so a save never changes them.
 */
export async function saveProfile(
  userId: string,
  expectedVersion: number,
  profile: AuthorProfile,
) {
  return getDb().transaction(async (tx) => {
    const version =
      expectedVersion === 0
        ? await repo.insertProfile(tx, userId, profile)
        : await repo.updateProfile(tx, userId, expectedVersion, profile);
    if (version === null) throw new ProfileError("version_conflict");
    await repo.insertRevision(tx, userId, version, profile);
    return version;
  });
}
