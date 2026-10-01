CREATE TABLE "idea_job_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"material_id" text NOT NULL,
	"material_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_id" text NOT NULL,
	"material_id" text NOT NULL,
	"material_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"title" text NOT NULL,
	"audience" text NOT NULL,
	"thesis" text NOT NULL,
	"rationale" text NOT NULL,
	"evidence_gaps" jsonb NOT NULL,
	"suggested_structure" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "source_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "idea_job_sources" ADD CONSTRAINT "idea_job_sources_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_job_sources" ADD CONSTRAINT "idea_job_sources_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_sources" ADD CONSTRAINT "idea_sources_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_sources" ADD CONSTRAINT "idea_sources_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idea_job_sources_job_material_idx" ON "idea_job_sources" USING btree ("job_id","material_id");--> statement-breakpoint
CREATE INDEX "idea_job_sources_material_idx" ON "idea_job_sources" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idea_sources_idea_material_idx" ON "idea_sources" USING btree ("idea_id","material_id");--> statement-breakpoint
CREATE INDEX "idea_sources_material_idx" ON "idea_sources" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "ideas_user_created_idx" ON "ideas" USING btree ("user_id","created_at");