-- A Seating without a limit (ADR 0009): total_capacity and
-- available_capacity become nullable, both NULL together when the Seating
-- takes any number of Reservations. Existing Seatings keep their limit.
ALTER TABLE "event_sessions" DROP CONSTRAINT "event_sessions_capacity_check";--> statement-breakpoint
ALTER TABLE "event_sessions" ALTER COLUMN "total_capacity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_sessions" ALTER COLUMN "available_capacity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_capacity_check" CHECK ((total_capacity IS NULL AND available_capacity IS NULL) OR (available_capacity >= 0 AND available_capacity <= total_capacity));