-- Password reset tokens are now stored by their SHA-256 hash. Existing rows
-- hold raw tokens that would no longer match; clear them, so pending links
-- stop working and Admins issue new ones (nothing is in production yet).
UPDATE "users" SET "password_reset_token" = NULL, "password_reset_expires" = NULL WHERE "password_reset_token" IS NOT NULL;
