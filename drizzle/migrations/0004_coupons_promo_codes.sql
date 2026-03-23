-- Migration: Add coupons and promotion_codes tables, extend reservations

-- Create discount_type enum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discount_type') THEN
        CREATE TYPE discount_type AS ENUM ('percent', 'amount');
    END IF;
END $$;

-- Create coupons table
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    discount_type discount_type NOT NULL,
    discount_value INTEGER NOT NULL,
    currency VARCHAR(3),
    max_redemptions INTEGER,
    redemption_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    stripe_coupon_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT coupons_discount_value_check CHECK (discount_value > 0),
    CONSTRAINT coupons_percent_range_check CHECK (discount_type != 'percent' OR discount_value <= 100)
);

CREATE INDEX IF NOT EXISTS coupons_event_id_idx ON coupons (event_id);
CREATE INDEX IF NOT EXISTS coupons_active_idx ON coupons (active);

-- Create promotion_codes table
CREATE TABLE IF NOT EXISTS promotion_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    max_redemptions INTEGER,
    redemption_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    stripe_promotion_code_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS promotion_codes_code_unique ON promotion_codes (code);
CREATE INDEX IF NOT EXISTS promotion_codes_coupon_id_idx ON promotion_codes (coupon_id);
CREATE INDEX IF NOT EXISTS promotion_codes_active_idx ON promotion_codes (active);

-- Add promotion code tracking to reservations
ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS promotion_code_id UUID REFERENCES promotion_codes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reservations_discount_check'
    ) THEN
        ALTER TABLE reservations
            ADD CONSTRAINT reservations_discount_check CHECK (discount_amount >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS reservations_promotion_code_id_idx ON reservations (promotion_code_id);
