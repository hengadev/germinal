-- Deposit rule and Pricing (issue 023).
--
-- Events gain a Deposit rule: none (value 0), fixed (value = minor units
-- per seat) or percent (value = whole percent 1..100 of the price after any
-- Promo Code). Full payment online is percent 100: every existing Event
-- takes it through the column defaults, so Guests keep paying the whole
-- price online — behaviour unchanged. New Events default to it too.
--
-- Reservations gain the Deposit paid online and the Balance due at the
-- venue, with deposit + balance = total_amount. Every existing Reservation
-- was paid in full online (or is a comp at 0), so it is backfilled with
-- deposit = total_amount and balance = 0.
--
-- Ordering (hand-checked): the enum, then the Event columns (their defaults
-- backfill existing rows), then the Reservation columns added nullable,
-- the backfill, NOT NULL, and only then the check constraints.
CREATE TYPE "public"."deposit_type" AS ENUM('none', 'fixed', 'percent');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "deposit_type" "deposit_type" DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "deposit_value" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "deposit_amount" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "balance_amount" integer;--> statement-breakpoint
UPDATE "reservations" SET "deposit_amount" = "total_amount", "balance_amount" = 0;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "deposit_amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "balance_amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_deposit_rule_check" CHECK ((deposit_type = 'none' AND deposit_value = 0) OR (deposit_type = 'fixed' AND deposit_value > 0) OR (deposit_type = 'percent' AND deposit_value BETWEEN 1 AND 100));--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_deposit_balance_check" CHECK (deposit_amount >= 0 AND balance_amount >= 0 AND deposit_amount + balance_amount = total_amount);
