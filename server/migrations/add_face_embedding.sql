-- Face-similarity sort.
--
-- Stores a per-image face embedding so the "manage subject" grid can order
-- images so visually-similar faces sit next to each other (a greedy
-- nearest-neighbour tour over these vectors; see server/api/media/search.get.ts).
--
--   face_embedding      512 little-endian float32s (2048 bytes), L2-normalized
--                       so a dot product equals cosine similarity. NULL = no
--                       embedding (image not yet processed, or no face found).
--   face_embedded_at    idempotency marker — NULL means "not yet processed".
--                       Set even when no face was found, so we don't retry it
--                       on every sweep (face_embedding stays NULL in that case).
--
-- Embeddings are computed by the CPU InsightFace `face-embed` service via
-- POST /api/media/faces/compute-embeddings. pgvector is intentionally NOT used:
-- per-subject sets are small (<=1000) so the nearest-neighbour tour runs in JS.

ALTER TABLE media_records
  ADD COLUMN face_embedding bytea,
  ADD COLUMN face_embedded_at timestamptz;

COMMENT ON COLUMN media_records.face_embedding IS
  '512 little-endian float32s (L2-normalized) of the dominant face; NULL = none. See server/utils/faceEmbedding.ts.';
COMMENT ON COLUMN media_records.face_embedded_at IS
  'When face embedding was last attempted. NULL = not yet processed (NULL embedding with a set timestamp = no face found).';

-- Speeds up the "find rows still needing embedding" scan in compute-embeddings.
CREATE INDEX IF NOT EXISTS media_records_face_embedded_at_idx
  ON media_records (face_embedded_at)
  WHERE face_embedded_at IS NULL;
