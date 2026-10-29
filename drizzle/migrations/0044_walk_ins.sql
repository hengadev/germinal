CREATE TYPE "public"."reservation_origin" AS ENUM('online', 'staff', 'walk_in');--> statement-breakpoint
ALTER TABLE "reservations" ALTER COLUMN "guest_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "origin" "reservation_origin" DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "made_by" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_made_by_users_id_fk" FOREIGN KEY ("made_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;