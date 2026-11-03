CREATE TYPE "public"."event_extra_unit" AS ENUM('per_person', 'per_unit');--> statement-breakpoint
CREATE TABLE "event_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name_en" varchar(255) NOT NULL,
	"name_fr" varchar(255) NOT NULL,
	"description_en" text,
	"description_fr" text,
	"price_amount" integer NOT NULL,
	"unit" "event_extra_unit" NOT NULL,
	"stock" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_extras_price_check" CHECK (price_amount >= 0),
	CONSTRAINT "event_extras_stock_check" CHECK (stock IS NULL OR stock >= 0)
);
--> statement-breakpoint
CREATE TABLE "reservation_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"event_extra_id" uuid NOT NULL,
	"name_en" varchar(255) NOT NULL,
	"name_fr" varchar(255) NOT NULL,
	"unit_price" integer NOT NULL,
	"unit" "event_extra_unit" NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_extras_unit_price_check" CHECK (unit_price >= 0),
	CONSTRAINT "reservation_extras_quantity_check" CHECK (quantity > 0)
);
--> statement-breakpoint
ALTER TABLE "event_extras" ADD CONSTRAINT "event_extras_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_extras" ADD CONSTRAINT "reservation_extras_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_extras" ADD CONSTRAINT "reservation_extras_event_extra_id_event_extras_id_fk" FOREIGN KEY ("event_extra_id") REFERENCES "public"."event_extras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_extras_event_id_idx" ON "event_extras" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "reservation_extras_reservation_id_idx" ON "reservation_extras" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "reservation_extras_event_extra_id_idx" ON "reservation_extras" USING btree ("event_extra_id");