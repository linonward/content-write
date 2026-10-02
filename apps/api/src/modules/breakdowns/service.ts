import { getDb } from "@content-write/db/client";
import { aiAvailable, aiMode } from "../../config";
import {
  enqueueJob,
  findIdempotentJob,
  hashInput,
  lockUserQueue,
} from "../ai-jobs/queue";
import { fetchLink, validatePublicUrl } from "../materials/link-fetch";
import { allowLinkFetch } from "../materials/repository";
import * as repo from "./repository";

export type BreakdownErrorReason =
  | "reference_missing"
  | "version_conflict"
  | "invalid_link"
  | "fetch_limit"
  | "content_required"
  | "already_done"
  | "job_active"
  | "idempotency_conflict"
  | "quota"
  | "concurrency"
  | "ai_unavailable";

export class BreakdownError extends Error {
  constructor(readonly reason: BreakdownErrorReason) {
    super(reason);
    this.name = "BreakdownError";
  }
}

export type BreakdownStatus = "unprocessed" | "processing" | "failed" | "done";

function statusOf(
  hasBreakdown: boolean,
  job: { status: string } | undefined,
): BreakdownStatus {
  if (hasBreakdown) return "done";
  if (job?.status === "queued" || job?.status === "running")
    return "processing";
  if (job?.status === "failed") return "failed";
  return "unprocessed";
}

export async function listReferences(userId: string) {
  const db = getDb();
  const rows = await repo.listReferences(db, userId);
  const items = rows.slice(0, 100);
  const ids = items.map((item) => item.id);
  const [done, jobs] = await Promise.all([
    repo.listBrokenDownVersions(db, ids),
    repo.listJobs(db, ids),
  ]);
  return {
    references: items.map((item) => {
      const current = (row: {
        referenceArticleId: string | null;
        referenceVersion: number | null;
      }) =>
        row.referenceArticleId === item.id &&
        row.referenceVersion === item.currentVersion;
      const breakdown = done.find(current);
      return {
        ...item,
        // Lets articles bind the current version's framework without opening it.
        breakdownId: breakdown?.id ?? null,
        status: statusOf(Boolean(breakdown), jobs.find(current)),
      };
    }),
    hasMore: rows.length > 100,
  };
}

/** Title for pasted text without one: its first non-empty line. */
function titleFrom(content: string) {
  const line = content.split("\n").find((value) => value.trim()) ?? "";
  return line.trim().slice(0, 200) || "未命名参考文章";
}

export async function createFromText(
  userId: string,
  input: { title?: string; content: string },
) {
  return repo.insertReference(getDb(), userId, {
    title: input.title || titleFrom(input.content),
    content: input.content,
  });
}

/**
 * Saves a public link. Fetching follows the T005 rules and switch; when it is
 * off or fails the link is kept and the author pastes the text.
 */
export async function createFromLink(
  userId: string,
  input: { url: string; fetch?: boolean },
) {
  let url: URL;
  try {
    url = validatePublicUrl(input.url);
  } catch {
    throw new BreakdownError("invalid_link");
  }
  const shouldFetch =
    input.fetch === true && process.env.REMOTE_FETCH_ENABLED === "true";
  if (shouldFetch && !(await allowLinkFetch(userId)))
    throw new BreakdownError("fetch_limit");
  const fetched = shouldFetch ? await fetchLink(url.href) : null;
  const id = await repo.insertReference(getDb(), userId, {
    title:
      fetched?.status === "fetched"
        ? fetched.title
        : url.hostname.slice(0, 200),
    content: fetched?.status === "fetched" ? fetched.content : "",
    sourceUrl: url.href,
    fetchStatus:
      fetched?.status === "fetched"
        ? "fetched"
        : shouldFetch
          ? "failed"
          : "disabled",
  });
  return { id, fetchStatus: fetched?.status ?? "disabled" };
}

export async function getReference(userId: string, id: string) {
  const db = getDb();
  const reference = await repo.findReference(db, userId, id);
  if (!reference) throw new BreakdownError("reference_missing");
  const [breakdown, job] = await Promise.all([
    repo.findBreakdown(db, id, reference.currentVersion),
    repo.findLatestJob(db, id, reference.currentVersion),
  ]);
  const { userId: _owner, ...fields } = reference;
  return {
    reference: { ...fields, status: statusOf(Boolean(breakdown), job) },
    breakdown: breakdown ?? null,
    latestJob: job ?? null,
    processingAvailable: aiAvailable(),
    aiMode: aiMode(),
  };
}

/** Editing the text makes a new version; the old breakdown stays bound to the old one. */
export async function updateReference(
  userId: string,
  id: string,
  expectedVersion: number,
  input: repo.ReferenceInput,
) {
  return getDb().transaction(async (tx) => {
    const updated = await repo.updateReference(
      tx,
      userId,
      id,
      expectedVersion,
      input,
    );
    if (updated) return updated.currentVersion;
    if (await repo.findReference(tx, userId, id))
      throw new BreakdownError("version_conflict");
    throw new BreakdownError("reference_missing");
  });
}

export async function deleteReference(userId: string, id: string) {
  if (!(await repo.deleteReference(getDb(), userId, id)))
    throw new BreakdownError("reference_missing");
}

/** Queues a breakdown of the current version, which must still be `expectedVersion`. */
export async function startBreakdown(
  userId: string,
  id: string,
  expectedVersion: number,
  key: string,
) {
  if (!aiAvailable()) throw new BreakdownError("ai_unavailable");
  const result = await getDb().transaction(async (tx) => {
    await lockUserQueue(tx, userId);
    const reference = await repo.lockReference(tx, userId, id);
    if (!reference) throw new BreakdownError("reference_missing");
    const inputHash = hashInput({
      kind: "reference_breakdown",
      id,
      expectedVersion,
      mode: aiMode(),
    });
    // Idempotency comes before the version check so a retried request returns its job.
    const prior = await findIdempotentJob(tx, userId, key, inputHash);
    if (prior) return prior;
    if (reference.currentVersion !== expectedVersion)
      throw new BreakdownError("version_conflict");
    if (!reference.content.trim()) throw new BreakdownError("content_required");
    if (await repo.findBreakdown(tx, id, expectedVersion))
      throw new BreakdownError("already_done");
    if (await repo.hasActiveJob(tx, id)) throw new BreakdownError("job_active");
    // Queue outcomes are returned, not thrown: limit checks write deadline cleanup that must commit.
    return enqueueJob(tx, {
      kind: "reference_breakdown",
      userId,
      idempotencyKey: key,
      inputHash,
      referenceArticleId: id,
      referenceVersion: expectedVersion,
    });
  });
  if (result.status === "conflict")
    throw new BreakdownError("idempotency_conflict");
  if (result.status === "quota") throw new BreakdownError("quota");
  if (result.status === "concurrency") throw new BreakdownError("concurrency");
  return result.jobId;
}
