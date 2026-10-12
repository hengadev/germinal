-- Venue Capacity with a per-Seating override (issue 021).
--
-- The Event gains a Venue Capacity that every Seating inherits; a Seating
-- may override it. event_sessions.total_capacity / available_capacity stay
-- the effective, booking-time values (reservation locking is unchanged);
-- capacity_overridden only records whether the Seating keeps its own
-- capacity when the Venue Capacity changes.
--
-- Backfill: an existing Event's Venue Capacity is the largest capacity among
-- its Seatings (an Event without Seatings, or whose Seatings all hold 0,
-- stays NULL). Seatings whose capacity differs from it are marked as
-- overrides, so no existing capacity changes. Ordering: columns first, then
-- the backfill, then the check constraint.
ALTER TABLE "events" ADD COLUMN "venue_capacity" integer;--> statement-breakpoint
ALTER TABLE "event_sessions" ADD COLUMN "capacity_overridden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "events" SET "venue_capacity" = "seatings"."max_capacity"
FROM (
	SELECT "event_id", NULLIF(max("total_capacity"), 0) AS "max_capacity"
	FROM "event_sessions"
	GROUP BY "event_id"
) AS "seatings"
WHERE "seatings"."event_id" = "events"."id";--> statement-breakpoint
UPDATE "event_sessions" SET "capacity_overridden" = true
FROM "events"
WHERE "events"."id" = "event_sessions"."event_id"
	AND "event_sessions"."total_capacity" IS DISTINCT FROM "events"."venue_capacity";--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_capacity_check" CHECK (venue_capacity IS NULL OR venue_capacity > 0);
