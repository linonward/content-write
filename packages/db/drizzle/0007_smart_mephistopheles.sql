CREATE TABLE "article_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"material_id" text NOT NULL,
	"material_version" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idea_id" text,
	"working_title" text NOT NULL,
	"audience" text NOT NULL,
	"thesis" text NOT NULL,
	"source_count" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"outline" jsonb,
	"outline_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "article_id" text;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "article_version" integer;--> statement-breakpoint
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_sources" ADD CONSTRAINT "article_sources_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_sources_article_material_idx" ON "article_sources" USING btree ("article_id","material_id");--> statement-breakpoint
CREATE INDEX "articles_user_updated_idx" ON "articles" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_user_idea_idx" ON "articles" USING btree ("user_id","idea_id");