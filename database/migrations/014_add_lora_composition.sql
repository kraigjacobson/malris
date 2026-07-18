-- Compositional LoRA prompts. A "position" (or "closeup") LoRA carries a base
-- prompt_template with labeled slots: [body] [expression] [accessory] [effect].
-- "Modifier" LoRAs (category body|expression|accessory|effect) carry a
-- prompt_fragment that fills the matching slot, so a position + modifiers
-- compose into one grammatical prompt at selection time.
--
-- default_strength is the recommended LoRA strength applied when the LoRA is
-- picked into a slot (positions ~1.0, modifiers lower so they don't overpower).
ALTER TABLE lora_metadata ADD COLUMN IF NOT EXISTS category VARCHAR(20);
ALTER TABLE lora_metadata ADD COLUMN IF NOT EXISTS prompt_fragment TEXT;
ALTER TABLE lora_metadata ADD COLUMN IF NOT EXISTS default_strength REAL;

COMMENT ON COLUMN lora_metadata.category IS 'position | closeup | body | expression | accessory | effect (NULL = treat as position)';
COMMENT ON COLUMN lora_metadata.prompt_fragment IS 'Modifier snippet that fills its category slot ([body]/[expression]/[accessory]/[effect]) in a base template';
COMMENT ON COLUMN lora_metadata.default_strength IS 'Recommended LoRA strength applied when this LoRA is selected into a slot';
