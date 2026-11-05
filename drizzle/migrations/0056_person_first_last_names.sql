ALTER TABLE "gift_cards" ADD COLUMN "recipient_first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "recipient_last_name" varchar(100);--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "buyer_first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "gift_cards" ADD COLUMN "buyer_last_name" varchar(100);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "guest_first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "guest_last_name" varchar(100);--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "last_name" varchar(100);--> statement-breakpoint
-- The names already stored, split at the first space: the first word is the
-- first name, the rest the last name (« Jean-Pierre de la Tour » → « Jean-Pierre »,
-- « de la Tour »). A single word is a first name with an empty last name.
UPDATE "reservations" SET
	"guest_first_name" = left(split_part(btrim("guest_name"), ' ', 1), 100),
	"guest_last_name" = left(btrim(substr(btrim("guest_name"), length(split_part(btrim("guest_name"), ' ', 1)) + 1)), 100)
WHERE "guest_first_name" IS NULL;--> statement-breakpoint
UPDATE "waitlist" SET
	"first_name" = left(split_part(btrim("name"), ' ', 1), 100),
	"last_name" = left(btrim(substr(btrim("name"), length(split_part(btrim("name"), ' ', 1)) + 1)), 100)
WHERE "first_name" IS NULL;--> statement-breakpoint
UPDATE "gift_cards" SET
	"buyer_first_name" = left(split_part(btrim("buyer_name"), ' ', 1), 100),
	"buyer_last_name" = left(btrim(substr(btrim("buyer_name"), length(split_part(btrim("buyer_name"), ' ', 1)) + 1)), 100)
WHERE "buyer_first_name" IS NULL AND "buyer_name" IS NOT NULL;--> statement-breakpoint
UPDATE "gift_cards" SET
	"recipient_first_name" = left(split_part(btrim("recipient_name"), ' ', 1), 100),
	"recipient_last_name" = left(btrim(substr(btrim("recipient_name"), length(split_part(btrim("recipient_name"), ' ', 1)) + 1)), 100)
WHERE "recipient_first_name" IS NULL AND "recipient_name" IS NOT NULL;
