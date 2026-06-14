-- Pixel-level refinement score for flagged duplicate pairs.
--
-- Perceptual hashes (dhash/phash) are deliberately invariant to small, local
-- changes — so two DIFFERENT frames of the same scene (e.g. a face mid-blink)
-- hash to distance 0, identical to a true re-encode. To separate those, we do
-- a second pass: decode both images at higher resolution and measure the
-- percentage of pixels that actually differ (see server/utils/perceptualHash.ts
-- pixelDiffPercent). True duplicates score ~0; distinct frames score higher.
--
-- NULL = not yet refined. Reset implicitly when find-pairs creates new pairs.

ALTER TABLE media_duplicate_pairs
  ADD COLUMN refined_diff real;

COMMENT ON COLUMN media_duplicate_pairs.refined_diff IS
  'Percent of pixels (0-100) that differ between the two images at 128x128 grayscale. ~0 = true duplicate; higher = visibly different frame. NULL = not refined yet.';
