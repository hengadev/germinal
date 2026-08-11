ALTER TABLE "site_settings" ADD COLUMN "sender_email" varchar(255);--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "maintenance_mode" boolean DEFAULT false NOT NULL;