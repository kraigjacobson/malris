-- AI-provenance flag for concept-training candidate filtering.
--
-- The concept/position LoRA path must train on REAL footage, not AI-generated
-- media. We tried an automated two-tier detector (metadata sniff + an open image
-- detector sidecar) but benched the detector: on video it was wrong both ways,
-- and on stills it false-flagged ~10% of real photos at high confidence (0.90+),
-- indistinguishable by score from true AI — so no threshold makes it a safe gate
-- (see CONCEPT-TRAINING-PLAN.md §5). Provenance is the reliable signal for this
-- library instead.
--
-- So `ai_generated` is a simple manual/provenance flag, not a detector output:
--   true   = AI-generated
--   false  = real
--   NULL   = undecided (not yet tagged) — the manual "to-do" bucket
--
-- Set in bulk by source-folder origin on import (e.g. Civit→true, Boost2→false)
-- and refined by multiselect bulk-edit in the media gallery. The concept LoRA
-- picker shows `ai_generated = false` (real) only; `NULL` and `true` are hidden.

ALTER TABLE media_records
  ADD COLUMN ai_generated boolean;

COMMENT ON COLUMN media_records.ai_generated IS
  'AI-provenance flag: true=AI, false=real, NULL=undecided. Set by folder bulk-tag + manual gallery edit (no auto-detector). Concept picker shows real only.';
