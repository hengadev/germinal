-- Login sessions are now stored by the SHA-256 hash of their token, not the
-- token itself. Existing rows hold raw tokens and can't be converted; drop
-- them so everyone signs in again (nothing is in production yet).
DELETE FROM "sessions";
