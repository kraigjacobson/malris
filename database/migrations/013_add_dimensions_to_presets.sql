-- Add width/height (t2v output dimensions) to job presets.
-- Nullable: i2v presets leave these NULL (i2v derives its size from the source
-- image); t2v presets store the chosen resolution so it persists per-preset and
-- pre-fills the form. Per-job width/height still live on jobs.parameters so a
-- single queued job can be re-dimensioned without touching its preset.
ALTER TABLE job_presets
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer;
