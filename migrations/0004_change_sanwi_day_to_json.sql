-- Drop old column if exists (SQLite doesn't support ALTER COLUMN)
-- Instead, we'll keep the old column and add a new one
ALTER TABLE hospitals ADD COLUMN sanwi_nosul_days TEXT; -- JSON array of dates
