CREATE TYPE "public"."dispute_status" AS ENUM('warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'won', 'lost', 'prevented');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"stripe_dispute_id" varchar(255) NOT NULL,
	"stripe_charge_id" varchar(255),
	"status" "dispute_status" NOT NULL,
	"reason" varchar(100),
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"evidence_due_by" timestamp with time zone,
	"admin_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_stripe_dispute_id_unique" UNIQUE("stripe_dispute_id"),
	CONSTRAINT "disputes_amount_check" CHECK (amount >= 0)
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "is_comp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_admin_id_idx" ON "audit_log" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "disputes_payment_id_idx" ON "disputes" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "disputes_stripe_dispute_id_idx" ON "disputes" USING btree ("stripe_dispute_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reservations_is_comp_idx" ON "reservations" USING btree ("is_comp");