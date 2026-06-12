-- Add explicit category column to subjects table.
-- Values: 'celeb' | 'asmr' | 'real'. NULL means "infer from name"
-- (the search endpoint falls back to matching 'celeb'/'asmr' substrings in name).

ALTER TABLE subjects
ADD COLUMN category VARCHAR(10);

ALTER TABLE subjects
ADD CONSTRAINT subject_category_check
  CHECK (category IS NULL OR category IN ('celeb', 'asmr', 'real'));

COMMENT ON COLUMN subjects.category IS 'Explicit subject category (celeb|asmr|real). NULL = infer from name.';
