-- Preferred output orientation for a base (position/closeup) LoRA, so a job/sweep
-- picks a frame the pose fits (e.g. doggy landscape, giantess/facesit portrait)
-- instead of Wan fisheye-cramming a wide pose into a portrait frame. Null = use
-- the form's chosen resolution. Populated by scripts/seed-lora-prompts.mjs.
ALTER TABLE lora_metadata ADD COLUMN IF NOT EXISTS orientation VARCHAR(20);
COMMENT ON COLUMN lora_metadata.orientation IS 'landscape | portrait — preferred aspect for this base LoRA (null = use form default)';
