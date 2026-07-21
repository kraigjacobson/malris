-- Measured image sharpness for the LoRA training picker.
--
-- The picker used to order source images by pixel dimensions (width*height),
-- which is blind to real detail: an upscaled blurry photo reports a high
-- resolution but carries no high-frequency content, and Wan trains at the 512
-- bucket anyway. This column stores a CPU-only sharpness metric computed with
-- sharp (grayscale -> resize to the training scale -> variance of the Laplacian,
-- contrast-normalized). Higher = more true detail Wan can learn.
--
--   sharpness      normalized focus measure (NULL = not yet scored)
--   sharpness_at   idempotency marker — NULL means "not yet scored"
--
-- Both nullable: rows are backfilled by POST /api/media/sharpness/compute and
-- rows that fail to decode are left NULL.

ALTER TABLE media_records
  ADD COLUMN sharpness real,
  ADD COLUMN sharpness_at timestamptz;

COMMENT ON COLUMN media_records.sharpness IS
  'Normalized sharpness / high-frequency detail at the 512 training scale (see server/utils/imageSharpness.ts). Higher = sharper. NULL = not yet scored.';
COMMENT ON COLUMN media_records.sharpness_at IS
  'When sharpness was last computed. NULL = not yet scored.';

-- Speeds up the "find rows still needing scoring" scan in compute-sharpness.
CREATE INDEX IF NOT EXISTS media_records_sharpness_at_idx
  ON media_records (sharpness_at)
  WHERE sharpness_at IS NULL;
