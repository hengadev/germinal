-- Assignments need a Staff Role (issue 013). Nothing is in production, so
-- existing local event_staff rows are dropped rather than guessed at.
DELETE FROM "event_staff";--> statement-breakpoint
-- The six starting Staff Roles (issue 013).
INSERT INTO "staff_roles" ("id", "name", "permissions") VALUES
	(gen_random_uuid(), 'Responsable', ARRAY['tasks','guest_list','scan_check_in','manual_check_in','dietary','contact','settle_balance','correct_mistake','move','walk_in']),
	(gen_random_uuid(), 'Porte', ARRAY['tasks','guest_list','scan_check_in','move','walk_in']),
	(gen_random_uuid(), 'Salle', ARRAY['tasks','guest_list','settle_balance']),
	(gen_random_uuid(), 'Cuisine', ARRAY['tasks','dietary']),
	(gen_random_uuid(), 'Bar', ARRAY['tasks']),
	(gen_random_uuid(), 'Photographe', ARRAY['tasks']);--> statement-breakpoint
ALTER TABLE "event_staff" ADD COLUMN "staff_role_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "event_staff" ADD COLUMN "granted_permissions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "event_staff" ADD COLUMN "withdrawn_permissions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "event_staff" ADD CONSTRAINT "event_staff_staff_role_id_staff_roles_id_fk" FOREIGN KEY ("staff_role_id") REFERENCES "public"."staff_roles"("id") ON DELETE restrict ON UPDATE no action;