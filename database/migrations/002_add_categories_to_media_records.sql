-- Add categories column to media_records table
-- This will store an array of category strings as JSONB

ALTER TABLE media_records 
ADD COLUMN categories JSONB DEFAULT '[]'::jsonb;

-- Add a comment to document the column
COMMENT ON COLUMN media_records.categories IS 'Array of category strings stored as JSONB';

-- Create an index on categories for better query performance
CREATE INDEX idx_media_records_categories ON media_records USING GIN (categories);