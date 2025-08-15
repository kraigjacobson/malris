-- Drop the categories column from media_records (from previous migration)
ALTER TABLE media_records DROP COLUMN IF EXISTS categories;

-- Create categories table
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(7), -- For UI color coding (hex color)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create media_record_categories junction table for many-to-many relationship
CREATE TABLE media_record_categories (
    id SERIAL PRIMARY KEY,
    media_record_uuid UUID NOT NULL REFERENCES media_records(uuid) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(media_record_uuid, category_id)
);

-- Create indexes for performance
CREATE INDEX idx_media_record_categories_media_uuid ON media_record_categories(media_record_uuid);
CREATE INDEX idx_media_record_categories_category_id ON media_record_categories(category_id);
CREATE INDEX idx_categories_name ON categories(name);

-- Insert some default categories
INSERT INTO categories (name, color) VALUES
('ass', '#ffdcc7ff'),
('teen', '#f8aef2ff'),
('milf', '#d4cc56ff'),
('scat', '#5a4526ff'),
('voyeur', '#0e2525ff'),
('rough', '#911818ff'),
('family', '#98D8C8'),
('asmr', '#516c85ff');

-- Add comments
COMMENT ON TABLE categories IS 'Categories for organizing media content';
COMMENT ON TABLE media_record_categories IS 'Many-to-many relationship between media records and categories';