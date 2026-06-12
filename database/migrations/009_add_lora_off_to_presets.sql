-- Persist the "lora strength disabled" UI state on presets.
--
-- Before this migration, disabling a lora strength in the form was applied by
-- writing 0 into the strength column at preset save time. That destroyed the
-- user's chosen strength on save, so re-enabling forgot the value. Now the
-- strength column stores the user's preferred value verbatim and a separate
-- boolean column records whether that strength is currently disabled.
--
-- The override is applied at the boundaries that consume effective values:
--   - job submission (SubmitJobModal applies the override before POSTing)
--   - queued→active snapshot (buildPresetSnapshot zeros out off strengths so
--     the worker, which doesn't know about _off flags, gets the right number)

ALTER TABLE job_presets
  ADD COLUMN IF NOT EXISTS lora_1_high_strength_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lora_1_low_strength_off  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lora_2_high_strength_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lora_2_low_strength_off  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lora_3_high_strength_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lora_3_low_strength_off  boolean NOT NULL DEFAULT false;

-- Backfill: any preset row that already has strength=0 in a populated slot was
-- almost certainly disabled via the old behavior — preserve that semantic by
-- marking it off. The strength stays at 0 (we can't recover the original); the
-- user can re-enable and bump the slider to whatever they want.
UPDATE job_presets SET lora_1_high_strength_off = true WHERE lora_1_high IS NOT NULL AND lora_1_high_strength = 0;
UPDATE job_presets SET lora_1_low_strength_off  = true WHERE lora_1_low  IS NOT NULL AND lora_1_low_strength  = 0;
UPDATE job_presets SET lora_2_high_strength_off = true WHERE lora_2_high IS NOT NULL AND lora_2_high_strength = 0;
UPDATE job_presets SET lora_2_low_strength_off  = true WHERE lora_2_low  IS NOT NULL AND lora_2_low_strength  = 0;
UPDATE job_presets SET lora_3_high_strength_off = true WHERE lora_3_high IS NOT NULL AND lora_3_high_strength = 0;
UPDATE job_presets SET lora_3_low_strength_off  = true WHERE lora_3_low  IS NOT NULL AND lora_3_low_strength  = 0;
