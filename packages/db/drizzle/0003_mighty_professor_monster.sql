ALTER TABLE "material_revisions" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_revisions" ADD COLUMN "source_filename" text;--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "source_filename" text;