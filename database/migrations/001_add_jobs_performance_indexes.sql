-- Performance optimization indexes for jobs table
-- These indexes will dramatically improve query performance for the jobs page

-- Index for status-based filtering with updated_at ordering (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_jobs_status_updated_at ON jobs(status, updated_at DESC);

-- Index for subject-based filtering with status and updated_at
CREATE INDEX IF NOT EXISTS idx_jobs_subject_status_updated ON jobs(subject_uuid, status, updated_at DESC);

-- Index for source type filtering (video vs source jobs)
CREATE INDEX IF NOT EXISTS idx_jobs_source_media_status ON jobs(source_media_uuid, status, updated_at DESC) 
WHERE source_media_uuid IS NOT NULL;

-- Index for source jobs (where source_media_uuid IS NULL)
CREATE INDEX IF NOT EXISTS idx_jobs_source_null_status ON jobs(status, updated_at DESC) 
WHERE source_media_uuid IS NULL;

-- Composite index for complex filtering scenarios
CREATE INDEX IF NOT EXISTS idx_jobs_composite_filter ON jobs(subject_uuid, status, source_media_uuid, updated_at DESC);

-- Index specifically for job counts aggregation (status grouping)
CREATE INDEX IF NOT EXISTS idx_jobs_status_only ON jobs(status);

-- Index for pagination with offset/limit queries
CREATE INDEX IF NOT EXISTS idx_jobs_updated_at_id ON jobs(updated_at DESC, id);

-- Comments explaining the indexes:
-- idx_jobs_status_updated_at: Optimizes status filtering with date ordering
-- idx_jobs_subject_status_updated: Optimizes subject + status filtering  
-- idx_jobs_source_media_status: Optimizes video job filtering
-- idx_jobs_source_null_status: Optimizes source job filtering (partial index)
-- idx_jobs_composite_filter: Handles complex multi-filter scenarios
-- idx_jobs_status_only: Optimizes the GROUP BY status query for counts
-- idx_jobs_updated_at_id: Optimizes pagination queries