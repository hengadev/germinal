CREATE TYPE "public"."service_kind" AS ENUM('lunch', 'dinner');--> statement-breakpoint
CREATE TABLE "event_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_days_event_date_unique" UNIQUE("event_id","date")
);--> statement-breakpoint
CREATE TABLE "event_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"kind" "service_kind" NOT NULL,
	"default_seating_duration_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_services_day_kind_unique" UNIQUE("day_id","kind")
);--> statement-breakpoint
-- Column added as nullable first: existing Sessions are backfilled below,
-- and only then is NOT NULL enforced (a NOT NULL ADD COLUMN with no default
-- would fail on any populated database).
ALTER TABLE "event_sessions" ADD COLUMN "service_id" uuid;--> statement-breakpoint
-- ============================================
-- Data migration (ADR 0005): each existing Session is wrapped in one Day
-- (its UTC date) and one Service — lunch if it starts before 16:00 UTC,
-- dinner otherwise (cut-off confirmed in issue 018). The Service's default
-- Seating duration is carried over from the longest Session of that meal.
-- ============================================
INSERT INTO "event_days" ("event_id", "date")
SELECT DISTINCT es."event_id", (es."start_time" AT TIME ZONE 'UTC')::date
FROM "event_sessions" es;--> statement-breakpoint
INSERT INTO "event_services" ("day_id", "kind", "default_seating_duration_minutes")
SELECT s."day_id", s."kind"::"service_kind", MAX(s."duration_minutes")::integer
FROM (
	SELECT
		d."id" AS "day_id",
		CASE
			WHEN (es."start_time" AT TIME ZONE 'UTC')::time < '16:00:00' THEN 'lunch'
			ELSE 'dinner'
		END AS "kind",
		GREATEST(1, CEIL(EXTRACT(EPOCH FROM (es."end_time" - es."start_time")) / 60))::integer AS "duration_minutes"
	FROM "event_sessions" es
	JOIN "event_days" d
		ON d."event_id" = es."event_id"
		AND d."date" = (es."start_time" AT TIME ZONE 'UTC')::date
) s
GROUP BY s."day_id", s."kind";--> statement-breakpoint
UPDATE "event_sessions" es
SET "service_id" = sv."id"
FROM "event_days" d
JOIN "event_services" sv ON sv."day_id" = d."id"
WHERE d."event_id" = es."event_id"
	AND d."date" = (es."start_time" AT TIME ZONE 'UTC')::date
	AND sv."kind" = (
		CASE
			WHEN (es."start_time" AT TIME ZONE 'UTC')::time < '16:00:00' THEN 'lunch'
			ELSE 'dinner'
		END
	)::"service_kind";--> statement-breakpoint
-- Every Session now has a parent Service: enforce it.
ALTER TABLE "event_sessions" ALTER COLUMN "service_id" SET NOT NULL;--> statement-breakpoint
-- Event start/end dates become derived from the Event's first and last Day:
-- start = first Day at 00:00 UTC, end = last Day at 23:59:59.999999 UTC.
UPDATE "events" e
SET "start_date" = (bounds."min_date"::timestamp AT TIME ZONE 'UTC'),
	"end_date" = ((bounds."max_date" + 1)::timestamp AT TIME ZONE 'UTC') - INTERVAL '1 microsecond',
	"updated_at" = now()
FROM (
	SELECT "event_id", MIN("date") AS "min_date", MAX("date") AS "max_date"
	FROM "event_days"
	GROUP BY "event_id"
) bounds
WHERE bounds."event_id" = e."id";--> statement-breakpoint
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_services" ADD CONSTRAINT "event_services_day_id_event_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."event_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_days_event_id_idx" ON "event_days" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_services_day_id_idx" ON "event_services" USING btree ("day_id");--> statement-breakpoint
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_service_id_event_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."event_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_sessions_service_id_idx" ON "event_sessions" USING btree ("service_id");
