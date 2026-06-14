-- Perceptual / near-duplicate detection.
--
-- The existing content_sha256 dedup only catches *byte-identical* files. It
-- cannot see re-encodes, resizes, recompression, or crops — which is where
-- most visual duplicates actually come from. These columns store cheap,
-- CPU-only perceptual fingerprints computed with sharp (no AI, no GPU):
--
--   dhash         8-byte difference hash of the whole image (resize/brightness)
--   phash         8-byte DCT perceptual hash of the whole image (re-encode)
--   tile_hashes   per-tile dHashes over an NxN grid (best-effort crop catch)
--   perceptual_hashed_at  idempotency marker — NULL means "not yet hashed"
--
-- All nullable: legacy rows are backfilled by the compute-hashes endpoint and
-- rows that fail to decode are simply left NULL.

ALTER TABLE media_records
  ADD COLUMN dhash bytea,
  ADD COLUMN phash bytea,
  ADD COLUMN tile_hashes jsonb,
  ADD COLUMN perceptual_hashed_at timestamptz;

COMMENT ON COLUMN media_records.dhash IS
  '8-byte difference hash of the whole image (perceptual; see server/utils/perceptualHash.ts).';
COMMENT ON COLUMN media_records.phash IS
  '8-byte DCT perceptual hash of the whole image.';
COMMENT ON COLUMN media_records.tile_hashes IS
  'Array of per-tile dHash hex strings (NxN grid) for best-effort crop matching.';
COMMENT ON COLUMN media_records.perceptual_hashed_at IS
  'When perceptual hashes were last computed. NULL = not yet hashed.';

-- Speeds up the "find rows still needing hashing" scan in compute-hashes.
CREATE INDEX IF NOT EXISTS media_records_perceptual_hashed_at_idx
  ON media_records (perceptual_hashed_at)
  WHERE perceptual_hashed_at IS NULL;


-- Flagged near-duplicate pairs awaiting human review.
--
-- media_a / media_b are stored ordered (media_a < media_b as text) so the
-- UNIQUE constraint dedupes regardless of which side a pair was discovered
-- from. ON DELETE CASCADE means that when a media row is deleted (via the
-- normal delete endpoint) any pair referencing it disappears automatically,
-- so the review feed never shows a pair with a missing member.
CREATE TABLE IF NOT EXISTS media_duplicate_pairs (
  id          serial PRIMARY KEY,
  media_a     uuid NOT NULL REFERENCES media_records(uuid) ON DELETE CASCADE,
  media_b     uuid NOT NULL REFERENCES media_records(uuid) ON DELETE CASCADE,
  method      varchar(10) NOT NULL,             -- 'dhash' | 'phash' | 'tile'
  distance    integer NOT NULL,                 -- Hamming distance, or (for tile) matched-tile count
  status      varchar(12) NOT NULL DEFAULT 'pending', -- 'pending' | 'dismissed' | 'resolved'
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT media_duplicate_pairs_pair_uq UNIQUE (media_a, media_b)
);

CREATE INDEX IF NOT EXISTS media_duplicate_pairs_status_idx
  ON media_duplicate_pairs (status);
CREATE INDEX IF NOT EXISTS media_duplicate_pairs_media_a_idx
  ON media_duplicate_pairs (media_a);
CREATE INDEX IF NOT EXISTS media_duplicate_pairs_media_b_idx
  ON media_duplicate_pairs (media_b);
