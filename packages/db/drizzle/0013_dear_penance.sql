CREATE TABLE "breakdowns" (
	"id" text PRIMARY KEY NOT NULL,
	"reference_article_id" text NOT NULL,
	"user_id" text NOT NULL,
	"reference_version" integer NOT NULL,
	"result" jsonb NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_article_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"reference_article_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"source_url" text,
	"fetch_status" text,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_url" text,
	"fetch_status" text,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "reference_article_id" text;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "reference_version" integer;--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_reference_article_id_reference_articles_id_fk" FOREIGN KEY ("reference_article_id") REFERENCES "public"."reference_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_article_revisions" ADD CONSTRAINT "reference_article_revisions_reference_article_id_reference_articles_id_fk" FOREIGN KEY ("reference_article_id") REFERENCES "public"."reference_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_article_revisions" ADD CONSTRAINT "reference_article_revisions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_articles" ADD CONSTRAINT "reference_articles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "breakdowns_reference_version_idx" ON "breakdowns" USING btree ("reference_article_id","reference_version");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_article_revisions_version_idx" ON "reference_article_revisions" USING btree ("reference_article_id","version");--> statement-breakpoint
CREATE INDEX "reference_articles_user_updated_idx" ON "reference_articles" USING btree ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_reference_article_id_reference_articles_id_fk" FOREIGN KEY ("reference_article_id") REFERENCES "public"."reference_articles"("id") ON DELETE cascade ON UPDATE no action;