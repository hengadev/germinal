CREATE TYPE "public"."media_role" AS ENUM('visual', 'event_photo');--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recap_en" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "recap_fr" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "role" "media_role";--> statement-breakpoint
-- Existing Event media were all uploaded as announcement images: they become Visuals.
UPDATE "media" SET "role" = 'visual' WHERE "event_id" IS NOT NULL;--> statement-breakpoint
-- One cover per role: keep a single cover per Event, preferring the Event's own cover_media_id, then the oldest.
UPDATE "media" AS m SET "is_cover" = false
WHERE m."is_cover" AND m."event_id" IS NOT NULL AND m."id" <> (
	SELECT m2."id" FROM "media" AS m2
	LEFT JOIN "events" AS e ON e."id" = m2."event_id"
	WHERE m2."event_id" = m."event_id" AND m2."is_cover"
	ORDER BY (m2."id" = e."cover_media_id") DESC NULLS LAST, m2."created_at", m2."id"
	LIMIT 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "media_event_role_cover_unique" ON "media" USING btree ("event_id","role") WHERE is_cover AND event_id IS NOT NULL;