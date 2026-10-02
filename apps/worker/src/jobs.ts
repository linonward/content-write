import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readProfileRevision } from "@content-write/db/author-profile";
import { getDb, getPool } from "@content-write/db/client";
import { type MemoryRef, readMemories } from "@content-write/db/memories";
import {
  readWritingSamples,
  type SampleRef,
} from "@content-write/db/writing-samples";
import {
  generateAnalysis,
  generateBreakdown,
  generateDraft,
  generateEdit,
  generateIdeas,
  generateMemories,
  generateOutline,
  type RunMeta,
} from "./ai/generate";
import { validateAnalysis } from "./analysis";
import { completeBreakdownJob, loadBreakdownReference } from "./breakdown-jobs";
import { completeDraftJob, loadDraftContext } from "./draft-jobs";
import { completeEditJob, loadEditContext } from "./edit-jobs";
import { describeFailure, TerminalJobError } from "./failures";
import { completeIdeaJob, loadIdeaSources } from "./idea-jobs";
import { completeMemoryJob } from "./memory-jobs";
import { completeOutlineJob, loadOutlineContext } from "./outline-jobs";
import { mockRun, runUsage } from "./runs";

export type Claimed = {
  id: string;
  user_id: string;
  material_id: string | null;
  material_version: number | null;
  source_count: number;
  article_id: string | null;
  article_version: number | null;
  reference_article_id: string | null;
  reference_version: number | null;
  profile_version: number | null;
  writing_samples: SampleRef[];
  memories: MemoryRef[];
  kind: string;
  claim_token: string;
  attempts: number;
};

export async function claimJob(): Promise<Claimed | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE ai_jobs SET status = 'failed', error_code = 'DEADLINE_EXCEEDED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE status IN ('queued','running') AND deadline_at <= now()",
    );
    await client.query(
      "UPDATE ai_jobs SET status = 'failed', error_code = 'ATTEMPTS_EXHAUSTED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE status = 'running' AND attempts >= 3 AND lease_until < now()",
    );
    const result = await client.query<Claimed>(
      `WITH next_job AS (
         SELECT id FROM ai_jobs
          WHERE kind = ANY($2::text[]) AND deadline_at > now()
            AND attempts < 3 AND (status = 'queued' OR (status = 'running' AND lease_until < now()))
          ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE ai_jobs j SET status = 'running', claim_token = $1, lease_until = now() + interval '30 seconds',
         attempts = attempts + 1, updated_at = now()
       FROM next_job WHERE j.id = next_job.id
       RETURNING j.id, j.user_id, j.material_id, j.material_version, j.source_count, j.article_id, j.article_version, j.reference_article_id, j.reference_version, j.profile_version, j.writing_samples, j.memories, j.kind, j.claim_token, j.attempts`,
      [randomUUID(), claimableKinds],
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function renewLease(job: Claimed) {
  const result = await getPool().query(
    "UPDATE ai_jobs SET lease_until = now() + interval '30 seconds', updated_at = now() WHERE id = $1 AND claim_token = $2 AND status = 'running' AND lease_until > now() AND deadline_at > now()",
    [job.id, job.claim_token],
  );
  return result.rowCount === 1;
}

export async function completeJob(
  job: Claimed,
  result: unknown,
  durationMs: number,
  meta: RunMeta = mockRun,
) {
  const usage = runUsage(meta);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(
      "SELECT id FROM ai_jobs WHERE id = $1 AND claim_token = $2 AND status = 'running' AND lease_until > now() AND deadline_at > now() FOR UPDATE",
      [job.id, job.claim_token],
    );
    if (!owned.rowCount) {
      await client.query("ROLLBACK");
      return "lost" as const;
    }
    const material = await client.query<{
      content: string;
      current_version: number;
    }>(
      "SELECT content, current_version FROM materials WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [job.material_id, job.user_id],
    );
    if (
      !material.rows[0] ||
      material.rows[0].current_version !== job.material_version
    ) {
      await client.query(
        "UPDATE ai_jobs SET status = 'stale', error_code = 'MATERIAL_VERSION_CHANGED', claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
        [job.id],
      );
      await client.query("COMMIT");
      return "stale" as const;
    }
    const parsed = validateAnalysis(material.rows[0].content, result);
    if (!parsed.success) throw new Error("Invalid material analysis output");
    await client.query(
      `INSERT INTO material_analyses (id, material_id, user_id, material_version, result, mode)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (material_id, material_version) DO NOTHING`,
      [
        randomUUID(),
        job.material_id,
        job.user_id,
        job.material_version,
        JSON.stringify(parsed.data),
        meta.mode,
      ],
    );
    await client.query(
      "UPDATE ai_jobs SET status = 'succeeded', error_code = NULL, claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1",
      [job.id],
    );
    await client.query(
      "INSERT INTO ai_runs (id, job_id, user_id, mode, duration_ms, input_tokens, output_tokens, reasoning_tokens) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        job.id,
        job.user_id,
        usage.mode,
        Math.max(0, Math.round(durationMs)),
        usage.inputTokens,
        usage.outputTokens,
        usage.reasoningTokens,
      ],
    );
    await client.query("COMMIT");
    return "succeeded" as const;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function failJob(job: Claimed, code: string, terminal = false) {
  await getPool().query(
    `UPDATE ai_jobs SET status = CASE WHEN NOT $4 AND attempts < 3 AND deadline_at > now() THEN 'queued' ELSE 'failed' END,
      error_code = $3, claim_token = NULL, lease_until = NULL, updated_at = now()
     WHERE id = $1 AND claim_token = $2 AND status = 'running'`,
    [job.id, job.claim_token, code, terminal],
  );
}

export async function staleJob(
  job: Claimed,
  code = "MATERIAL_VERSION_CHANGED",
) {
  await getPool().query(
    "UPDATE ai_jobs SET status = 'stale', error_code = $3, claim_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1 AND claim_token = $2 AND status = 'running'",
    [job.id, job.claim_token, code],
  );
}

async function runAnalysis(job: Claimed, started: number) {
  if (!job.material_id || job.material_version === null) {
    await staleJob(job);
    return;
  }
  const material = await getPool().query<{
    content: string;
    current_version: number;
  }>(
    "SELECT content, current_version FROM materials WHERE id = $1 AND user_id = $2",
    [job.material_id, job.user_id],
  );
  if (
    !material.rows[0] ||
    material.rows[0].current_version !== job.material_version
  ) {
    await staleJob(job);
    return;
  }
  const { output, meta } = await generateAnalysis(material.rows[0].content);
  await completeJob(job, output, performance.now() - started, meta);
}

async function runIdeas(job: Claimed, started: number) {
  const sources = await loadIdeaSources(job);
  if (!sources || sources.length !== job.source_count) {
    await staleJob(job);
    return;
  }
  const { output, meta } = await generateIdeas(
    sources,
    await profileFor(job),
    undefined,
    await samplesFor(job),
    await memoriesFor(job),
  );
  await completeIdeaJob(job, output, performance.now() - started, meta);
}

/** Rechecks recorded sample refs before sending model input. */
function samplesFor(job: Claimed) {
  return readWritingSamples(getDb(), job.user_id, job.writing_samples ?? []);
}

/** Rechecks recorded memory refs: only still-confirmed, unchanged memories are sent. */
function memoriesFor(job: Claimed) {
  return readMemories(getDb(), job.user_id, job.memories ?? []);
}

/** The profile revision recorded when the job was queued, not the current one. */
function profileFor(job: Claimed) {
  return readProfileRevision(getDb(), job.user_id, job.profile_version);
}

async function runOutline(job: Claimed, started: number) {
  const context = await loadOutlineContext(job);
  if (!context) {
    await staleJob(job);
    return;
  }
  const { output, meta } = await generateOutline(
    context.brief,
    context.sources,
    context.framework,
    await profileFor(job),
    undefined,
    await samplesFor(job),
    await memoriesFor(job),
  );
  await completeOutlineJob(job, output, performance.now() - started, meta);
}

async function runDraft(job: Claimed, started: number) {
  const context = await loadDraftContext(job);
  if (!context) {
    await staleJob(job);
    return;
  }
  const { output, meta } = await generateDraft(
    context,
    await profileFor(job),
    undefined,
    await samplesFor(job),
    await memoriesFor(job),
  );
  await completeDraftJob(job, output, performance.now() - started, meta);
}

async function runEdit(job: Claimed, started: number) {
  const context = await loadEditContext(job);
  if (!context) {
    await staleJob(job, "ARTICLE_CHANGED");
    return;
  }
  const { output, meta } = await generateEdit(
    context,
    undefined,
    await samplesFor(job),
    await profileFor(job),
    await memoriesFor(job),
  );
  await completeEditJob(job, output, performance.now() - started, meta);
}

async function runBreakdown(job: Claimed, started: number) {
  const reference = await loadBreakdownReference(job);
  if (!reference) {
    await staleJob(job);
    return;
  }
  const { output, meta } = await generateBreakdown(
    reference.title,
    reference.content,
  );
  await completeBreakdownJob(job, output, performance.now() - started, meta);
}

async function runMemories(job: Claimed, started: number) {
  const samples = await samplesFor(job);
  if (!samples.length) {
    await staleJob(job, "SAMPLES_CHANGED");
    return;
  }
  const { output, meta } = await generateMemories(samples);
  await completeMemoryJob(job, output, performance.now() - started, meta);
}

// Every claimable kind has exactly one handler; claimJob only selects these kinds.
const handlers: Record<
  string,
  (job: Claimed, started: number) => Promise<void>
> = {
  material_analysis: runAnalysis,
  idea_generation: runIdeas,
  outline_generation: runOutline,
  draft_generation: runDraft,
  reference_breakdown: runBreakdown,
  edit_suggestion: runEdit,
  memory_extraction: runMemories,
};
export const claimableKinds = Object.keys(handlers);

export async function processOneJob() {
  const job = await claimJob();
  if (!job) return false;
  const started = performance.now();
  const renewal = setInterval(() => {
    void renewLease(job).catch(() => undefined);
  }, 10_000);
  try {
    const handler = handlers[job.kind];
    if (!handler) throw new TerminalJobError("UNSUPPORTED_JOB_KIND");
    await handler(job, started);
  } catch (error) {
    const failure = describeFailure(job.kind, error);
    console.error("worker: job failed", {
      jobId: job.id,
      kind: job.kind,
      attempt: job.attempts,
      code: failure.code,
      reason: failure.reason,
      terminal: failure.terminal,
    });
    await failJob(job, failure.code, failure.terminal);
  } finally {
    clearInterval(renewal);
  }
  return true;
}
