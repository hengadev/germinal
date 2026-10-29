CREATE TABLE "staff_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "event_staff" DROP COLUMN "role_label";