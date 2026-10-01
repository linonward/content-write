import {
  index,
  integer,
  jsonb,
  pgTable,
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
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    materialVersion: integer("material_version").notNull(),
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

export const aiRuns = pgTable("ai_runs", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => aiJobs.id, { onDelete: "cascade" }),
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
