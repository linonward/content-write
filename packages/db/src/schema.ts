import {
  type AnyPgColumn,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Minimal operational table. Business tables arrive with their user-facing slices.
export const serviceState = pgTable("service_state", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const materials = pgTable(
  "materials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("text"),
    sourceFilename: text("source_filename"),
    sourceUrl: text("source_url"),
    fetchStatus: text("fetch_status"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("materials_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const materialRevisions = pgTable(
  "material_revisions",
  {
    id: text("id").primaryKey(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    kind: text("kind").notNull().default("text"),
    sourceFilename: text("source_filename"),
    sourceUrl: text("source_url"),
    fetchStatus: text("fetch_status"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("material_revisions_material_version_idx").on(
      table.materialId,
      table.version,
    ),
  ],
);

export const linkFetchLimits = pgTable("link_fetch_limits", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const materialAnalyses = pgTable(
  "material_analyses",
  {
    id: text("id").primaryKey(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    materialVersion: integer("material_version").notNull(),
    result: jsonb("result").notNull(),
    mode: text("mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("material_analyses_version_idx").on(
      table.materialId,
      table.materialVersion,
    ),
  ],
);

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Only material_analysis jobs reference a material; other kinds keep their sources in their own tables.
    materialId: text("material_id").references(() => materials.id, {
      onDelete: "cascade",
    }),
    materialVersion: integer("material_version"),
    articleId: text("article_id").references((): AnyPgColumn => articles.id, {
      onDelete: "cascade",
    }),
    articleVersion: integer("article_version"),
    sourceCount: integer("source_count").notNull().default(1),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    claimToken: text("claim_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_jobs_user_key_idx").on(table.userId, table.idempotencyKey),
    index("ai_jobs_queue_idx").on(table.status, table.leaseUntil),
    index("ai_jobs_user_created_idx").on(table.userId, table.createdAt),
  ],
);

// Usage outlives deleted jobs so model cost and volume stay auditable.
export const aiRuns = pgTable("ai_runs", {
  id: text("id").primaryKey(),
  jobId: text("job_id").references(() => aiJobs.id, { onDelete: "set null" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  durationMs: integer("duration_ms").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  estimatedCost: text("estimated_cost"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Daily logical generation count; independent of job rows so deleting content never restores quota.
export const aiDailyUsage = pgTable(
  "ai_daily_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

export const ideaJobSources = pgTable(
  "idea_job_sources",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    materialVersion: integer("material_version").notNull(),
  },
  (table) => [
    uniqueIndex("idea_job_sources_job_material_idx").on(
      table.jobId,
      table.materialId,
    ),
    index("idea_job_sources_material_idx").on(table.materialId),
  ],
);

export const ideas = pgTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => aiJobs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    audience: text("audience").notNull(),
    thesis: text("thesis").notNull(),
    rationale: text("rationale").notNull(),
    evidenceGaps: jsonb("evidence_gaps").$type<string[]>().notNull(),
    suggestedStructure: jsonb("suggested_structure")
      .$type<string[]>()
      .notNull(),
    status: text("status").notNull().default("new"),
    mode: text("mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ideas_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const ideaSources = pgTable(
  "idea_sources",
  {
    id: text("id").primaryKey(),
    ideaId: text("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    materialVersion: integer("material_version").notNull(),
  },
  (table) => [
    uniqueIndex("idea_sources_idea_material_idx").on(
      table.ideaId,
      table.materialId,
    ),
    index("idea_sources_material_idx").on(table.materialId),
  ],
);

export const articles = pgTable(
  "articles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ideaId: text("idea_id").references(() => ideas.id, {
      onDelete: "set null",
    }),
    workingTitle: text("working_title").notNull(),
    audience: text("audience").notNull(),
    thesis: text("thesis").notNull(),
    sourceCount: integer("source_count").notNull(),
    version: integer("version").notNull().default(1),
    outline: jsonb("outline").$type<{
      workingTitle: string;
      audience: string;
      thesis: string;
      sections: {
        heading: string;
        purpose: string;
        keyPoints: string[];
        evidenceIds: string[];
        missingEvidence: string[];
      }[];
    }>(),
    outlineConfirmedAt: timestamp("outline_confirmed_at", {
      withTimezone: true,
    }),
    // Body fields stay null until the first draft is applied.
    title: text("title"),
    body: text("body"),
    currentDraftId: text("current_draft_id").references(
      (): AnyPgColumn => articleDrafts.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("articles_user_updated_idx").on(table.userId, table.updatedAt),
    uniqueIndex("articles_user_idea_idx").on(table.userId, table.ideaId),
  ],
);

export const articleSources = pgTable(
  "article_sources",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    materialVersion: integer("material_version").notNull(),
  },
  (table) => [
    uniqueIndex("article_sources_article_material_idx").on(
      table.articleId,
      table.materialId,
    ),
  ],
);

export type DraftSourceLink = {
  claim: string;
  materialId: string;
  materialVersion: number;
  evidenceIds: string[];
};

// One row per generated draft. `applied` became the body, `candidate` waits for the author.
export const articleDrafts = pgTable(
  "article_drafts",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references((): AnyPgColumn => articles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => aiJobs.id, {
      onDelete: "set null",
    }),
    baseVersion: integer("base_version").notNull(),
    title: text("title").notNull(),
    markdown: text("markdown").notNull(),
    sourceMap: jsonb("source_map").$type<DraftSourceLink[]>().notNull(),
    evidenceGaps: jsonb("evidence_gaps").$type<string[]>().notNull(),
    status: text("status").notNull(),
    mode: text("mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A retried job must not store a second result.
    uniqueIndex("article_drafts_job_idx").on(table.jobId),
    index("article_drafts_article_created_idx").on(
      table.articleId,
      table.createdAt,
    ),
  ],
);

// Every body or title change: edits, drafts that became the body, and restores.
export const articleRevisions = pgTable(
  "article_revisions",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    source: text("source").notNull(),
    // Set when source is "restore": the version whose text was brought back.
    restoredFrom: integer("restored_from"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("article_revisions_article_version_idx").on(
      table.articleId,
      table.version,
    ),
  ],
);
