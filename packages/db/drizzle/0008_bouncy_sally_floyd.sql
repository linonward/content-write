CREATE TABLE "ai_daily_usage" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_daily_usage_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "ai_runs" DROP CONSTRAINT "ai_runs_job_id_ai_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_jobs" ALTER COLUMN "material_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_jobs" ALTER COLUMN "material_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_runs" ALTER COLUMN "job_id" DROP NOT NULL;--> statement-breakpoint
INSERT INTO "ai_daily_usage" ("user_id", "day", "count")
SELECT "user_id", ("created_at" AT TIME ZONE 'Asia/Shanghai')::date, count(*)::integer
FROM "ai_jobs" GROUP BY 1, 2;--> statement-breakpoint
UPDATE "ai_jobs" SET "material_id" = NULL, "material_version" = NULL WHERE "kind" <> 'material_analysis';--> statement-breakpoint
UPDATE "ai_jobs" SET "status" = 'stale', "error_code" = 'ARTICLE_OR_SOURCE_CHANGED', "claim_token" = NULL, "lease_until" = NULL, "article_id" = NULL
WHERE "article_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "articles" WHERE "articles"."id" = "ai_jobs"."article_id");--> statement-breakpoint
ALTER TABLE "ai_daily_usage" ADD CONSTRAINT "ai_daily_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE set null ON UPDATE no action;