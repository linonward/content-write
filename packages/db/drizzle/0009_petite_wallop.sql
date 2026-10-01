CREATE TABLE "article_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text,
	"base_version" integer NOT NULL,
	"title" text NOT NULL,
	"markdown" text NOT NULL,
	"source_map" jsonb NOT NULL,
	"evidence_gaps" jsonb NOT NULL,
	"status" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "current_draft_id" text;--> statement-breakpoint
ALTER TABLE "article_drafts" ADD CONSTRAINT "article_drafts_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_drafts" ADD CONSTRAINT "article_drafts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_drafts" ADD CONSTRAINT "article_drafts_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_drafts_job_idx" ON "article_drafts" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "article_drafts_article_created_idx" ON "article_drafts" USING btree ("article_id","created_at");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_current_draft_id_article_drafts_id_fk" FOREIGN KEY ("current_draft_id") REFERENCES "public"."article_drafts"("id") ON DELETE set null ON UPDATE no action;