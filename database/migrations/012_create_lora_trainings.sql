-- One row per Wan2.2 character-LoRA training run. Trainings ride the existing
-- jobs queue as job_type='train_lora' (single-active guard serializes them
-- against generation on the one GPU); this table holds everything job rows
-- don't: the picked images, the training config, and the published outputs.
--
-- status: queued | training | paused | completed | failed | canceled
-- Filesystem layout keyed by this id (run_id) under /var/mnt/hdd/train:
--   datasets/<id>/  exported decrypted images + .txt captions
--   runs/<id>/      dataset.toml, low.toml, high.toml, checkpoints, trainer.log

CREATE TABLE IF NOT EXISTS lora_trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  subject_uuid UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  lora_name VARCHAR(100) NOT NULL UNIQUE,
  trigger_word VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  image_uuids JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_loras JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lora_trainings_job_id ON lora_trainings (job_id);
CREATE INDEX IF NOT EXISTS idx_lora_trainings_subject ON lora_trainings (subject_uuid);
CREATE INDEX IF NOT EXISTS idx_lora_trainings_status ON lora_trainings (status);
