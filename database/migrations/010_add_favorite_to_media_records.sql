-- Per-image "favorite" flag. The bulk i2v create endpoint uses this as its
-- source of truth: it creates one job per favorited source image, regardless
-- of whether the parent subject already has any jobs. Favorites are managed
-- from the Manage Subject modal.

ALTER TABLE media_records
  ADD COLUMN IF NOT EXISTS favorite boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_media_records_favorite_source
  ON media_records (subject_uuid)
  WHERE favorite = true AND purpose = 'source' AND type = 'image';
