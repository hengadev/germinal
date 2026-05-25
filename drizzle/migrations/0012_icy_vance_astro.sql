ALTER TABLE "events" ADD COLUMN "is_portfolio" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "events_portfolio_idx" ON "events" USING btree ("is_portfolio");