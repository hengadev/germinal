CREATE TYPE "public"."gift_card_ledger_reason" AS ENUM('booking', 'door', 'refund', 'admin_adjustment');--> statement-breakpoint
CREATE TYPE "public"."gift_card_origin" AS ENUM('online', 'admin');--> statement-breakpoint
CREATE TYPE "public"."gift_card_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "gift_card_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_card_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" "gift_card_ledger_reason" NOT NULL,
	"reservation_id" uuid,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"initial_amount" integer NOT NULL,
	"balance" integer NOT NULL,
	"status" "gift_card_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"recipient_name" varchar(255),
	"recipient_email" varchar(255),
	"message" text,
	"buyer_name" varchar(255),
	"buyer_email" varchar(255),
	"origin" "gift_card_origin" DEFAULT 'online' NOT NULL,
	"stripe_reference" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_cards_code_unique" UNIQUE("code"),
	CONSTRAINT "gift_cards_initial_amount_check" CHECK (initial_amount > 0),
	CONSTRAINT "gift_cards_balance_check" CHECK (balance >= 0 AND balance <= initial_amount)
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "gift_card_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_card_ledger" ADD CONSTRAINT "gift_card_ledger_gift_card_id_gift_cards_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_ledger" ADD CONSTRAINT "gift_card_ledger_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_ledger" ADD CONSTRAINT "gift_card_ledger_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_card_ledger_gift_card_id_idx" ON "gift_card_ledger" USING btree ("gift_card_id");--> statement-breakpoint
CREATE INDEX "gift_card_ledger_reservation_id_idx" ON "gift_card_ledger" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "gift_cards_status_idx" ON "gift_cards" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gift_cards_expires_at_idx" ON "gift_cards" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_gift_card_amount_check" CHECK (gift_card_amount >= 0);