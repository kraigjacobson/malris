-- Add rating column to media_records table
-- Rating is an integer from 1 to 5 (nullable)

ALTER TABLE media_records 
ADD COLUMN rating INTEGER;

-- Add check constraint to ensure rating is between 1 and 5 when not null
ALTER TABLE media_records 
ADD CONSTRAINT rating_range_check CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));

-- Add comment to describe the column
COMMENT ON COLUMN media_records.rating IS 'User rating for media record (1-5 scale, nullable)';