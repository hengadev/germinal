ALTER TABLE "reservations" ADD COLUMN "last_moved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "last_moved_by" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_last_moved_by_users_id_fk" FOREIGN KEY ("last_moved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;