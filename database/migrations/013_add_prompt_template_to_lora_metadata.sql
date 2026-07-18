-- Per-LoRA default prompt template + negative prompt, keyed by the same `name`
-- as trigger_words (the LoRA's path relative to LORAS_DIR, e.g. "t2v/foo.safetensors").
--
-- The template may contain Dynamic-Prompts {a|b|c} wildcards; the app expands
-- them at job activation (server/utils/expandWildcards.ts), so a single stored
-- template yields varied concrete prompts. Lets the preset editor one-click
-- fill a prompt from the selected LoRA. Seeded for the t2v LoRA library via
-- `yarn seed:lora-prompts` (scripts/seed-lora-prompts.mjs).
ALTER TABLE lora_metadata ADD COLUMN IF NOT EXISTS prompt_template TEXT;
ALTER TABLE lora_metadata ADD COLUMN IF NOT EXISTS negative_prompt TEXT;

COMMENT ON COLUMN lora_metadata.prompt_template IS 'Default prompt for this LoRA; may contain {a|b|c} wildcards expanded at job activation';
COMMENT ON COLUMN lora_metadata.negative_prompt IS 'Default negative prompt applied alongside prompt_template';
