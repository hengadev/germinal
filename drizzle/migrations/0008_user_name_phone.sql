ALTER TABLE "users" ADD COLUMN "first_name" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
UPDATE "users" SET "first_name" = '', "last_name" = '' WHERE "first_name" IS NULL OR "last_name" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "first_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_name" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "users_first_name_idx" ON "users" USING btree ("first_name");--> statement-breakpoint
CREATE INDEX "users_last_name_idx" ON "users" USING btree ("last_name");--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");
