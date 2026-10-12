-- Seating titles become optional (issue 020): an admin adds Seatings to a
-- Service as start times, and public pages derive a label from the Seating's
-- Day, Service and start time when no title is stored. Existing rows keep
-- their titles — nothing to backfill.
ALTER TABLE "event_sessions" ALTER COLUMN "title_en" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_sessions" ALTER COLUMN "title_fr" DROP NOT NULL;
