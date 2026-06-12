-- Stores per-LoRA metadata keyed by filename.
-- Decoupled from job_presets so trigger words persist across preset changes
-- and can be looked up cheaply when rendering the LoRA dropdowns.
CREATE TABLE IF NOT EXISTS lora_metadata (
    name VARCHAR(255) PRIMARY KEY,
    trigger_words TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE lora_metadata IS 'Per-LoRA metadata (trigger words, etc.) keyed by safetensors filename';
