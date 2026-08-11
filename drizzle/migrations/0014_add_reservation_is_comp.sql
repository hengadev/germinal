ALTER TABLE "reservations" ADD COLUMN "is_comp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "reservations_is_comp_idx" ON "reservations" USING btree ("is_comp");