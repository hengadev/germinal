CREATE TABLE "event_role_briefs" (
	"event_id" uuid NOT NULL,
	"staff_role_id" uuid NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_role_briefs_event_id_staff_role_id_pk" PRIMARY KEY("event_id","staff_role_id")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "staff_brief" text;--> statement-breakpoint
ALTER TABLE "event_role_briefs" ADD CONSTRAINT "event_role_briefs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_role_briefs" ADD CONSTRAINT "event_role_briefs_staff_role_id_staff_roles_id_fk" FOREIGN KEY ("staff_role_id") REFERENCES "public"."staff_roles"("id") ON DELETE cascade ON UPDATE no action;