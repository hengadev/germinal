ALTER TABLE "events" ADD COLUMN "booking_opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "booking_closes_hours_before" integer;