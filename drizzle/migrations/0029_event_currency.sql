ALTER TABLE "events" ADD COLUMN "currency" varchar(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
-- Issue 042: the currency moves from each Service to its Event. Each Event
-- takes the currency most of its Services use (all EUR today); an Event
-- without Services keeps the EUR default.
UPDATE "events" SET "currency" = picked."currency"
FROM (
	SELECT DISTINCT ON (d."event_id") d."event_id", s."currency"
	FROM "event_services" s
	INNER JOIN "event_days" d ON d."id" = s."day_id"
	GROUP BY d."event_id", s."currency"
	ORDER BY d."event_id", count(*) DESC, s."currency"
) AS picked
WHERE picked."event_id" = "events"."id";--> statement-breakpoint
ALTER TABLE "event_services" DROP COLUMN "currency";
