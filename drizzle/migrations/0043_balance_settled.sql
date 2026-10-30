ALTER TABLE "reservations" ADD COLUMN "balance_settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "balance_settled_by" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_balance_settled_by_users_id_fk" FOREIGN KEY ("balance_settled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;