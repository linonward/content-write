CREATE TABLE "edit_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text,
	"base_version" integer NOT NULL,
	"scope" text NOT NULL,
	"selection_start" integer NOT NULL,
	"selection_end" integer NOT NULL,
	"selection_text" text NOT NULL,
	"instruction" text NOT NULL,
	"replacement" text,
	"explanation" text,
	"evidence_gaps" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"applied_version" integer,
	"mode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "edit_suggestions" ADD CONSTRAINT "edit_suggestions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_suggestions" ADD CONSTRAINT "edit_suggestions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_suggestions" ADD CONSTRAINT "edit_suggestions_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "edit_suggestions_job_idx" ON "edit_suggestions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "edit_suggestions_article_created_idx" ON "edit_suggestions" USING btree ("article_id","created_at");