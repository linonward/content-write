CREATE TABLE "article_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_revisions_article_version_idx" ON "article_revisions" USING btree ("article_id","version");--> statement-breakpoint
-- Articles drafted before history existed start their history at the current version.
INSERT INTO "article_revisions" ("id", "article_id", "user_id", "version", "title", "body", "source", "created_at")
SELECT gen_random_uuid()::text, "id", "user_id", "version", COALESCE("title", "working_title"), "body", 'draft', "updated_at"
  FROM "articles" WHERE "body" IS NOT NULL;
