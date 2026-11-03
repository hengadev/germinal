ALTER TABLE "check_ins" ADD COLUMN "client_id" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "check_ins_client_id_idx" ON "check_ins" USING btree ("client_id");