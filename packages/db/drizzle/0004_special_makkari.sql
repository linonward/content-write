CREATE TABLE "link_fetch_limits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_revisions" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "material_revisions" ADD COLUMN "fetch_status" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "fetch_status" text;--> statement-breakpoint
ALTER TABLE "link_fetch_limits" ADD CONSTRAINT "link_fetch_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;