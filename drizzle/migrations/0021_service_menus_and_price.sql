-- One Menu per Service with its price (issue 022).
--
-- Menus are described once per Event (EN/FR) and attached to Services; the
-- price moves from the Seating (event_sessions) to the Service, so every
-- Seating of a Service is booked at the Service's price.
--
-- Backfill: each Service takes the price shared by most of its Seatings
-- (ties: the earliest Seating's, then the lowest). Migration 0018 may have
-- merged several Sessions with different prices into one Service; those
-- whose price differs from the Service's keep it as a legacy per-Seating
-- price (legacy_price_amount / legacy_currency) so no migrated Seating
-- changes its booking price. Every other Seating gets NULL there and is
-- priced from its Service. Services without Seatings have no price yet.
--
-- Ordering (hand-checked): new table and columns first, then constraints,
-- then the rename of the Seating's price columns, the backfill, and only
-- then the check constraint that requires amount and currency together.
CREATE TABLE "event_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name_en" varchar(255) NOT NULL,
	"name_fr" varchar(255) NOT NULL,
	"description_en" text,
	"description_fr" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_services" ADD COLUMN "menu_id" uuid;--> statement-breakpoint
ALTER TABLE "event_services" ADD COLUMN "price_amount" integer;--> statement-breakpoint
ALTER TABLE "event_services" ADD COLUMN "currency" varchar(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_menus" ADD CONSTRAINT "event_menus_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_menus_event_id_idx" ON "event_menus" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "event_services" ADD CONSTRAINT "event_services_menu_id_event_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."event_menus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_services_menu_id_idx" ON "event_services" USING btree ("menu_id");--> statement-breakpoint
ALTER TABLE "event_services" ADD CONSTRAINT "event_services_price_check" CHECK (price_amount IS NULL OR price_amount >= 0);--> statement-breakpoint
ALTER TABLE "event_sessions" DROP CONSTRAINT "event_sessions_price_check";--> statement-breakpoint
ALTER TABLE "event_sessions" RENAME COLUMN "price_amount" TO "legacy_price_amount";--> statement-breakpoint
ALTER TABLE "event_sessions" RENAME COLUMN "currency" TO "legacy_currency";--> statement-breakpoint
ALTER TABLE "event_sessions" ALTER COLUMN "legacy_price_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "event_sessions" ALTER COLUMN "legacy_currency" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "event_sessions" ALTER COLUMN "legacy_currency" DROP NOT NULL;--> statement-breakpoint
UPDATE "event_services" SET "price_amount" = "dominant"."amount", "currency" = "dominant"."currency"
FROM (
	SELECT DISTINCT ON ("service_id") "service_id", "amount", "currency"
	FROM (
		SELECT "service_id", "legacy_price_amount" AS "amount", upper("legacy_currency") AS "currency",
			count(*) AS "seatings", min("start_time") AS "first_start"
		FROM "event_sessions"
		GROUP BY "service_id", "legacy_price_amount", upper("legacy_currency")
	) AS "prices"
	ORDER BY "service_id", "seatings" DESC, "first_start" ASC, "amount" ASC
) AS "dominant"
WHERE "dominant"."service_id" = "event_services"."id";--> statement-breakpoint
UPDATE "event_sessions" SET "legacy_price_amount" = NULL, "legacy_currency" = NULL
FROM "event_services"
WHERE "event_services"."id" = "event_sessions"."service_id"
	AND "event_services"."price_amount" = "event_sessions"."legacy_price_amount"
	AND "event_services"."currency" = upper("event_sessions"."legacy_currency");--> statement-breakpoint
UPDATE "event_sessions" SET "legacy_currency" = upper("legacy_currency")
WHERE "legacy_currency" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "event_sessions" ADD CONSTRAINT "event_sessions_legacy_price_check" CHECK ((legacy_price_amount IS NULL) = (legacy_currency IS NULL) AND (legacy_price_amount IS NULL OR legacy_price_amount >= 0));
