-- Concept key shared by a LoRA's high- and low-noise files (e.g. both
-- "t2v/34doggy-...-HN-..." and "...-LN-..." get pair_key 'doggy'). Lets the UI
-- auto-select the matching counterpart when you pick one noise half, since the
-- filenames alone don't line up (epoch numbers differ between the pair).
ALTER TABLE lora_metadata ADD COLUMN IF NOT EXISTS pair_key VARCHAR(60);

COMMENT ON COLUMN lora_metadata.pair_key IS 'Shared concept id for a high/low LoRA pair; used to auto-fill the counterpart noise slot';
