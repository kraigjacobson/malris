-- Natural-language Florence-2 captions for Wan LoRA training.
--
-- malris's WD14 tagging runs every tag through an allowlist (tagConfig.ts) that
-- collapses output to a small canonical vocabulary — great for categorization,
-- but it strips the descriptive context Wan2.2's T5 encoder learns best from.
-- These columns store a prose caption from the Florence-2 captioner sidecar
-- (comfy-docker/florence_captioner), which the training exporter prefers over
-- the tag list (see captionFor in server/services/loraTrainingService.ts).
--
--   caption      natural-language description (NULL = not yet captioned)
--   caption_at   idempotency marker — NULL means "not yet captioned"
--
-- Both nullable: rows are backfilled by POST /api/media/caption/compute and
-- images that fail to caption are left NULL (training falls back to tags).

ALTER TABLE media_records
  ADD COLUMN caption text,
  ADD COLUMN caption_at timestamptz;

COMMENT ON COLUMN media_records.caption IS
  'Natural-language Florence-2 caption (prose) preferred for Wan LoRA training captions. NULL = not yet captioned.';
COMMENT ON COLUMN media_records.caption_at IS
  'When the caption was last computed. NULL = not yet captioned.';

-- Speeds up the "find rows still needing captioning" scan in compute.
CREATE INDEX IF NOT EXISTS media_records_caption_at_idx
  ON media_records (caption_at)
  WHERE caption_at IS NULL;
