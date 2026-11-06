ALTER TABLE "event_drink_cards" DROP CONSTRAINT "event_drink_cards_event_id_unique";--> statement-breakpoint
ALTER TABLE "event_drink_cards" ADD COLUMN "name_en" varchar(255) NOT NULL DEFAULT 'Drinks';--> statement-breakpoint
ALTER TABLE "event_drink_cards" ADD COLUMN "name_fr" varchar(255) NOT NULL DEFAULT 'Boissons';--> statement-breakpoint
ALTER TABLE "event_services" ADD COLUMN "drink_card_id" uuid;--> statement-breakpoint
ALTER TABLE "event_services" ADD CONSTRAINT "event_services_drink_card_id_event_drink_cards_id_fk" FOREIGN KEY ("drink_card_id") REFERENCES "public"."event_drink_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_drink_cards_event_id_idx" ON "event_drink_cards" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_services_drink_card_id_idx" ON "event_services" USING btree ("drink_card_id");--> statement-breakpoint
ALTER TABLE "event_drink_cards" ALTER COLUMN "name_en" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "event_drink_cards" ALTER COLUMN "name_fr" DROP DEFAULT;--> statement-breakpoint
-- Data migration (issue 087): each existing card keeps its content, takes
-- the name « Boissons »/« Drinks », and is offered on every Service (meal)
-- of its Event.
UPDATE "event_drink_cards" SET "name_fr" = 'Boissons', "name_en" = 'Drinks';--> statement-breakpoint
UPDATE "event_services" AS s SET "drink_card_id" = c."id"
FROM "event_drink_cards" AS c
JOIN "event_days" AS d ON d."event_id" = c."event_id"
WHERE s."day_id" = d."id";