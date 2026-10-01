/** Unsaved article text kept in this browser after a failed or conflicting save. */
export type LocalCopy = {
  baseVersion: number;
  title: string;
  body: string;
  savedAt: string;
};

const PREFIX = "content-write:article:";

export function readLocalCopy(
  storage: Storage,
  articleId: string,
): LocalCopy | null {
  try {
    const value = JSON.parse(
      storage.getItem(PREFIX + articleId) ?? "null",
    ) as Partial<LocalCopy> | null;
    if (
      !value ||
      !Number.isInteger(value.baseVersion) ||
      typeof value.title !== "string" ||
      typeof value.body !== "string" ||
      typeof value.savedAt !== "string"
    )
      return null;
    return value as LocalCopy;
  } catch {
    return null;
  }
}

export function writeLocalCopy(
  storage: Storage,
  articleId: string,
  copy: LocalCopy,
) {
  storage.setItem(PREFIX + articleId, JSON.stringify(copy));
}

export function removeLocalCopy(storage: Storage, articleId: string) {
  storage.removeItem(PREFIX + articleId);
}

/** Sign-out removes every article copy so the next person on this browser cannot read them. */
export function clearLocalCopies(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

/**
 * - `same`: the server already has this text; the copy can be dropped.
 * - `restorable`: written on top of the current server version.
 * - `outdated`: the server moved on since; restoring would replace newer text,
 *   so it is only offered as an explicit choice.
 */
export function recoveryState(
  copy: LocalCopy | null,
  server: { version: number; title: string; body: string },
) {
  if (!copy) return "none" as const;
  if (copy.title === server.title && copy.body === server.body)
    return "same" as const;
  return copy.baseVersion === server.version
    ? ("restorable" as const)
    : ("outdated" as const);
}
