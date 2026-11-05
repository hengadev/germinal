ALTER TABLE "contact_submissions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "contact_submissions_updated_at_idx" ON "contact_submissions" USING btree ("updated_at");--> statement-breakpoint
UPDATE "contact_submissions" SET "updated_at" = "created_at";
