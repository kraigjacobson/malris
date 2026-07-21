-- Full WD14 tagging marker (concept tag-search).
--
-- malris's in-app tagging runs every WD14 tag through an allowlist (tagConfig.ts)
-- that collapses output to a small canonical vocabulary — fine for the old
-- categorization UI, but too narrow for the concept LoRA tag-search, which needs
-- the FULL booru tag set. The standalone WD14 sidecar (comfy-docker/wd14_tagger)
-- returns the complete tags; the full-tag backfill (POST /api/media/full-tag/
-- compute) re-tags media through it and stamps tags_full_at.
--
--   tags_full_at  idempotency marker — NULL means "not yet full-tagged" (i.e. the
--                 row still has only the limited allowlist tags, if any).

ALTER TABLE media_records
  ADD COLUMN tags_full_at timestamptz;

COMMENT ON COLUMN media_records.tags_full_at IS
  'When the full (non-allowlisted) WD14 tag set was last written. NULL = only legacy allowlist tags.';

-- Speeds up the "find rows still needing full tagging" scan.
CREATE INDEX IF NOT EXISTS media_records_tags_full_at_idx
  ON media_records (tags_full_at)
  WHERE tags_full_at IS NULL;
