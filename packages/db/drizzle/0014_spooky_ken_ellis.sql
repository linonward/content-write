ALTER TABLE "articles" ADD COLUMN "breakdown_id" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "framework" jsonb;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_breakdown_id_breakdowns_id_fk" FOREIGN KEY ("breakdown_id") REFERENCES "public"."breakdowns"("id") ON DELETE set null ON UPDATE no action;