DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'badge_type') THEN
    CREATE TYPE "public"."badge_type" AS ENUM('none', 'featured', 'vip', 'popular', 'best_value', 'limited');
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "event_sessions" ADD COLUMN IF NOT EXISTS "badge_type" "badge_type" DEFAULT 'none' NOT NULL;
