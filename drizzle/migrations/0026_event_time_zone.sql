ALTER TABLE "events" ADD COLUMN "time_zone" varchar(64) DEFAULT 'Europe/Paris' NOT NULL;--> statement-breakpoint
-- ADR 0006: Seatings were typed as UTC clock readings that meant Paris time.
-- Reinterpret each stored UTC clock reading as the same Europe/Paris wall-clock time.
UPDATE "event_sessions" SET
	"start_time" = ("start_time" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris',
	"end_time" = ("end_time" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris';--> statement-breakpoint
-- Events' start/end dates are their first and last Day, in their Time Zone.
UPDATE "events" SET
	"start_date" = (bounds.first_day::timestamp) AT TIME ZONE "events"."time_zone",
	"end_date" = (((bounds.last_day + 1)::timestamp) AT TIME ZONE "events"."time_zone") - interval '1 millisecond'
FROM (
	SELECT "event_id", min("date") AS first_day, max("date") AS last_day
	FROM "event_days"
	GROUP BY "event_id"
) AS bounds
WHERE bounds."event_id" = "events"."id";
