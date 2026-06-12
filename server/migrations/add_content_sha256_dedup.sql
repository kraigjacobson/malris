-- Idempotent-upload dedup: SHA256 of the *plaintext* file bytes.
-- The existing `checksum` column is computed on ciphertext and was being
-- compared against plaintext hashes in the upload paths, which silently
-- failed on race conditions and on any chunk-size variance. This column
-- replaces it for dedup purposes.
--
-- Partial unique index: NULLs are allowed (Postgres treats them as distinct
-- under a normal unique index, but the partial WHERE clause makes the intent
-- explicit), so legacy rows without a content_sha256 don't block writes.

ALTER TABLE media_records
  ADD COLUMN content_sha256 bytea;

CREATE UNIQUE INDEX media_records_content_sha256_uq
  ON media_records (content_sha256)
  WHERE content_sha256 IS NOT NULL;

COMMENT ON COLUMN media_records.content_sha256 IS
  'SHA256 of plaintext file bytes (32 bytes). Used for idempotent upload dedup. NULL for legacy rows backfilled later or never.';
