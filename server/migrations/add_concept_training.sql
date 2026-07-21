-- Concept/position LoRA training support on lora_trainings.
--
-- A CHARACTER training learns one person's identity from that subject's images.
-- A CONCEPT/position training learns a pose/action ACROSS many people: it selects
-- dest images (real only) by TAG, with no single subject, and captions each item
-- as trigger + (its WD14 tags MINUS the target tag) so the trigger absorbs the
-- pose (see CONCEPT-TRAINING-PLAN.md §6). So a concept run has NO subject_uuid.
--
--   kind         'character' (default, existing) | 'concept'
--   concept_tag  the target WD14 tag a concept run trains (NULL for character)
--   subject_uuid now nullable (was NOT NULL) — concept runs leave it NULL

ALTER TABLE lora_trainings ALTER COLUMN subject_uuid DROP NOT NULL;

ALTER TABLE lora_trainings
  ADD COLUMN kind        varchar(20) NOT NULL DEFAULT 'character',
  ADD COLUMN concept_tag varchar(100);

COMMENT ON COLUMN lora_trainings.kind IS
  'character = single-subject identity LoRA; concept = pose/action across many subjects.';
COMMENT ON COLUMN lora_trainings.concept_tag IS
  'Target WD14 tag a concept run trains (NULL for character runs).';
