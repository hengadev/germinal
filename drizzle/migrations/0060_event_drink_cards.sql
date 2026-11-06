CREATE TABLE "event_drink_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note_en" text,
	"note_fr" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_drink_cards_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "event_drink_cards" ADD CONSTRAINT "event_drink_cards_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;