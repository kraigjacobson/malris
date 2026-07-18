-- Civitai reference for a LoRA, resolved by file SHA256 via the by-hash API
-- (scripts/enrich-lora-triggers.mjs). Lets the UI show/link the source model and
-- keeps trigger_words authoritative (populated from Civitai trainedWords).
ALTER TABLE lora_metadata ADD COLUMN IF NOT EXISTS civitai_name TEXT;
ALTER TABLE lora_metadata ADD COLUMN IF NOT EXISTS civitai_url TEXT;

COMMENT ON COLUMN lora_metadata.civitai_name IS 'Civitai model name resolved by file hash';
COMMENT ON COLUMN lora_metadata.civitai_url IS 'Civitai model page URL (modelId + versionId)';
