-- Expand i2v presets from 3 LoRA slots to 5. Mirrors the lora_1..3 columns
-- (plus the strength_off flags added in migration 009). The Wan 2.2 i2v
-- workflow gained matching loader nodes (240/241 for slot 4, 250/251 for
-- slot 5); workflow_manager.update_custom_loras maps these params onto them.

ALTER TABLE job_presets
  ADD COLUMN IF NOT EXISTS lora_4_high varchar(255),
  ADD COLUMN IF NOT EXISTS lora_4_low varchar(255),
  ADD COLUMN IF NOT EXISTS lora_4_high_strength real,
  ADD COLUMN IF NOT EXISTS lora_4_low_strength real,
  ADD COLUMN IF NOT EXISTS lora_4_high_strength_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lora_4_low_strength_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lora_5_high varchar(255),
  ADD COLUMN IF NOT EXISTS lora_5_low varchar(255),
  ADD COLUMN IF NOT EXISTS lora_5_high_strength real,
  ADD COLUMN IF NOT EXISTS lora_5_low_strength real,
  ADD COLUMN IF NOT EXISTS lora_5_high_strength_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lora_5_low_strength_off boolean NOT NULL DEFAULT false;
