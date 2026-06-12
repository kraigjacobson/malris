-- Promote the preset reference from a jsonb stash (parameters._preset_id) to a
-- real FK column so queued jobs can read preset values live, while terminal
-- jobs keep their parameters snapshot for historical accuracy.
--
-- ON DELETE SET NULL: terminal jobs (active/completed/failed/canceled/need_input)
-- already have their snapshot, so they survive preset deletion. Queued jobs that
-- still reference a soon-to-be-deleted preset are deleted at the application
-- layer in the preset DELETE handler before the preset row is removed.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS preset_id uuid REFERENCES job_presets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_preset_id ON jobs(preset_id);

-- Backfill preset_id from the jsonb stash. Use a regex guard so a malformed
-- _preset_id value can't fail the cast and abort the migration. Subjecting to
-- "IN (SELECT id FROM job_presets)" silently drops references to presets that
-- no longer exist.
UPDATE jobs
SET preset_id = (parameters->>'_preset_id')::uuid
WHERE parameters ? '_preset_id'
  AND parameters->>'_preset_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND (parameters->>'_preset_id')::uuid IN (SELECT id FROM job_presets);

-- Queued i2v jobs that can't resolve a preset are unrunnable under the new
-- model (they have no snapshot and no live source), so delete them.
DELETE FROM jobs
WHERE status = 'queued'
  AND job_type = 'i2v'
  AND preset_id IS NULL;

-- For remaining queued i2v jobs, clear the parameters snapshot. Display and
-- worker submission will resolve preset values live until the job is picked
-- up and snapshotted at queued→active transition.
UPDATE jobs
SET parameters = '{}'::jsonb
WHERE status = 'queued'
  AND job_type = 'i2v'
  AND preset_id IS NOT NULL;

-- vid_faceswap queued jobs are untouched: they don't use presets and their
-- parameters (frames_per_batch, skip_seconds, video_filename) are real per-job
-- values, not preset-derived snapshots.

-- Terminal jobs (active/completed/failed/canceled/need_input) are untouched:
-- their parameters snapshot is the historical record we want to preserve.
