CREATE TABLE "author_profile_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"bio" text NOT NULL,
	"topics" jsonb NOT NULL,
	"audience" text NOT NULL,
	"preferences" text NOT NULL,
	"banned_words" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "author_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"preferences" text DEFAULT '' NOT NULL,
	"banned_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "profile_version" integer;--> statement-breakpoint
ALTER TABLE "author_profile_revisions" ADD CONSTRAINT "author_profile_revisions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_profiles" ADD CONSTRAINT "author_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "author_profile_revisions_version_idx" ON "author_profile_revisions" USING btree ("user_id","version");