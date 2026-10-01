import { randomUUID } from "node:crypto";
import type { Executor } from "./client";
import { articleRevisions } from "./schema";

/**
 * Records the article's body at a version. Call in the transaction that
 * produced that version so history and the current row never disagree.
 */
export async function recordRevision(
  db: Executor,
  revision: {
    articleId: string;
    userId: string;
    version: number;
    title: string;
    body: string;
    source: "edit" | "draft" | "restore";
    restoredFrom?: number;
  },
) {
  await db.insert(articleRevisions).values({ id: randomUUID(), ...revision });
}
