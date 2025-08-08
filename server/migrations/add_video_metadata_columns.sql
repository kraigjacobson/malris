-- Migration to add fps, codec, and bitrate columns to media_records table
-- Run this migration to add the new video metadata columns

ALTER TABLE media_records 
ADD COLUMN fps REAL,
ADD COLUMN codec VARCHAR(50),
ADD COLUMN bitrate INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN media_records.fps IS 'Frames per second for video files';
COMMENT ON COLUMN media_records.codec IS 'Video codec (h264, h265, etc.)';
COMMENT ON COLUMN media_records.bitrate IS 'Video bitrate in bits per second';

-- Update existing records to extract metadata from JSON field
-- This will populate the new columns with data from existing metadata JSON
UPDATE media_records 
SET 
    fps = CASE 
        WHEN metadata->>'fps' IS NOT NULL THEN (metadata->>'fps')::REAL 
        ELSE NULL 
    END,
    codec = CASE 
        WHEN metadata->>'codec' IS NOT NULL THEN metadata->>'codec' 
        ELSE NULL 
    END,
    bitrate = CASE 
        WHEN metadata->>'bitrate' IS NOT NULL THEN (metadata->>'bitrate')::INTEGER 
        ELSE NULL 
    END
WHERE type = 'video' AND metadata IS NOT NULL;