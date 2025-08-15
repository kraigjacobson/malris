-- Add large object support to media_records table
-- This migration adds columns to support both BYTEA and PostgreSQL Large Objects

-- Add new columns for large object support
ALTER TABLE media_records
ADD COLUMN storage_type VARCHAR(10) DEFAULT 'bytea' CHECK (storage_type IN ('bytea', 'lob')),
ADD COLUMN large_object_oid OID,
ADD COLUMN size_threshold BIGINT DEFAULT 104857600, -- 100MB threshold
ADD COLUMN encryption_method VARCHAR(20) DEFAULT 'full-file' CHECK (encryption_method IN ('full-file', 'chunk-based')),
ADD COLUMN chunk_size INTEGER DEFAULT 1048576; -- 1MB chunks for chunk-based encryption

-- Add index for storage type for better query performance
CREATE INDEX idx_media_records_storage_type ON media_records(storage_type);

-- Add constraint to ensure one storage method is used
ALTER TABLE media_records 
ADD CONSTRAINT chk_storage_method 
CHECK (
    (storage_type = 'bytea' AND encrypted_data IS NOT NULL AND large_object_oid IS NULL) OR
    (storage_type = 'lob' AND encrypted_data IS NULL AND large_object_oid IS NOT NULL)
);

-- Add comments to document the new columns
COMMENT ON COLUMN media_records.storage_type IS 'Storage method: bytea for small files, lob for large files';
COMMENT ON COLUMN media_records.large_object_oid IS 'PostgreSQL Large Object OID for files larger than threshold';
COMMENT ON COLUMN media_records.size_threshold IS 'Size threshold in bytes for choosing storage method';
COMMENT ON COLUMN media_records.encryption_method IS 'Encryption method: full-file for small media, chunk-based for large videos';
COMMENT ON COLUMN media_records.chunk_size IS 'Chunk size in bytes for chunk-based encryption';

-- Function to clean up orphaned large objects
CREATE OR REPLACE FUNCTION cleanup_orphaned_large_objects()
RETURNS INTEGER AS $$
DECLARE
    orphan_count INTEGER := 0;
    loid OID;
BEGIN
    FOR loid IN 
        SELECT DISTINCT l.oid 
        FROM pg_largeobject l 
        LEFT JOIN media_records m ON l.oid = m.large_object_oid 
        WHERE m.large_object_oid IS NULL
    LOOP
        PERFORM lo_unlink(loid);
        orphan_count := orphan_count + 1;
    END LOOP;
    
    RETURN orphan_count;
END;
$$ LANGUAGE plpgsql;

-- Function to migrate existing BYTEA records that exceed threshold to Large Objects
CREATE OR REPLACE FUNCTION migrate_large_bytea_to_lob(threshold_bytes BIGINT DEFAULT 104857600)
RETURNS INTEGER AS $$
DECLARE
    record_count INTEGER := 0;
    media_record RECORD;
    new_oid OID;
    fd INTEGER;
BEGIN
    FOR media_record IN 
        SELECT uuid, encrypted_data 
        FROM media_records 
        WHERE storage_type = 'bytea' 
        AND file_size > threshold_bytes
        AND encrypted_data IS NOT NULL
    LOOP
        -- Create new large object
        SELECT lo_create(0) INTO new_oid;
        
        -- Open for writing
        SELECT lo_open(new_oid, 131072) INTO fd; -- Write mode
        
        -- Write the data
        PERFORM lo_write(fd, media_record.encrypted_data);
        
        -- Close the large object
        PERFORM lo_close(fd);
        
        -- Update the record
        UPDATE media_records 
        SET 
            storage_type = 'lob',
            large_object_oid = new_oid,
            encrypted_data = NULL
        WHERE uuid = media_record.uuid;
        
        record_count := record_count + 1;
    END LOOP;
    
    RETURN record_count;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically clean up large objects when records are deleted
CREATE OR REPLACE FUNCTION cleanup_large_object_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.storage_type = 'lob' AND OLD.large_object_oid IS NOT NULL THEN
        PERFORM lo_unlink(OLD.large_object_oid);
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_large_object_on_delete
    BEFORE DELETE ON media_records
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_large_object_on_delete();