CREATE TABLE "publish_records" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"user_id" text NOT NULL,
	"article_version" integer NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publish_records" ADD CONSTRAINT "publish_records_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_records" ADD CONSTRAINT "publish_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publish_records_article_url_idx" ON "publish_records" USING btree ("article_id","url");--> statement-breakpoint
CREATE INDEX "publish_records_user_published_idx" ON "publish_records" USING btree ("user_id","published_at");