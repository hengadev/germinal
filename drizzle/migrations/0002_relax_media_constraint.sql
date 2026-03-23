-- Relax media entity check constraint to allow orphaned media records.
-- The old constraint required exactly one of event_id/talent_id to be non-null,
-- which broke uploads on create pages where the entity doesn't exist yet.
-- The new constraint only prevents both from being set simultaneously.
ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_event_or_talent_check";--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'media_entity_mutual_exclusion_check' AND table_name = 'media'
  ) THEN
    ALTER TABLE "media" ADD CONSTRAINT "media_entity_mutual_exclusion_check" CHECK (NOT (event_id IS NOT NULL AND talent_id IS NOT NULL));
  END IF;
END $$;
