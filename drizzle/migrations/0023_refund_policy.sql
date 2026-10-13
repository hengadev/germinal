-- Refund Policy (issue 027).
--
-- Events gain a Refund Policy: manual (EN/FR statement, each refund decided
-- by an Admin) or rules (tiers { hoursBefore, percent } in a jsonb array,
-- validated by the Refund Policy module; the check only guards the shape).
--
-- Existing Events get a manual policy whose text states the terms they had:
-- guests could cancel from their Ticket up to 24 hours before the Seating
-- for a full refund of what they paid online, and had to contact Germinal
-- after that — behaviour unchanged. New Events default to the equivalent
-- rule: full refund until 24 hours before the Seating.
--
-- Ordering (hand-checked): the enum, then the columns added with the
-- defaults existing rows must get (manual, no tiers), the backfill of the
-- manual text, then the defaults switched to those of new Events, and only
-- then the check constraint.
CREATE TYPE "public"."refund_policy_type" AS ENUM('manual', 'rules');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "refund_policy_type" "refund_policy_type" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "refund_policy_text_en" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "refund_policy_text_fr" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "refund_policy_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "events" SET "refund_policy_text_en" = 'You can cancel from your ticket up to 24 hours before your seating for a full refund of what you paid online. Closer to the seating, please contact us.', "refund_policy_text_fr" = 'Vous pouvez annuler depuis votre billet jusqu’à 24 h avant votre séance pour un remboursement intégral du montant payé en ligne. Passé ce délai, contactez-nous.';--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "refund_policy_type" SET DEFAULT 'rules';--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "refund_policy_tiers" SET DEFAULT '[{"hoursBefore":24,"percent":100}]'::jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_refund_policy_check" CHECK (CASE WHEN jsonb_typeof(refund_policy_tiers) <> 'array' THEN false WHEN refund_policy_type = 'manual' THEN true ELSE jsonb_array_length(refund_policy_tiers) BETWEEN 1 AND 10 END);
