CREATE TABLE "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"status" text NOT NULL,
	"origin" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mode" text,
	"job_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "memories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memories_user_created_idx" ON "memories" USING btree ("user_id","created_at");