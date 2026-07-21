/**
 * Pure-CPU image sharpness estimation for the LoRA training picker.
 *
 * Pixel dimensions (width*height) are a poor proxy for training quality: an
 * upscaled blurry photo reports a high resolution but carries no real detail,
 * and Wan trains at the 512 bucket regardless. What matters is high-frequency
 * detail *at the scale the trainer actually sees*.
 *
 * So we decode with sharp (already a dep — no AI, no GPU), downscale to a fixed
 * working grid near the training scale, and measure the variance of the
 * Laplacian (a classic focus / blur metric: sharp edges => high variance),
 * normalized by intensity variance so contrast/exposure doesn't dominate the
 * ranking. An upscaled-blurry image collapses back to blurry here and scores
 * low; a natively sharp image scores high.
 */
import sharp from 'sharp'

// Fixed working size. Big enough to expose blur, small enough to stay cheap
// across a whole subject's library. Measuring at ~this scale also mirrors what
// Wan gets after its own downscale to the 512 bucket.
const SIZE = 256

/**
 * Return a normalized sharpness score (>= 0, higher = sharper) for an encoded
 * image buffer. Flat/undecodable images return 0.
 */
export async function computeSharpness(imageBuffer: Buffer): Promise<number> {
  // failOn:'none' — tolerate truncated/mildly-corrupt files (common here) and
  // still produce a usable estimate. fit:'fill' distorts aspect, which is fine
  // for an edge-energy statistic and keeps every image on the same grid.
  const gray = await sharp(imageBuffer, { failOn: 'none' })
    .grayscale()
    .resize(SIZE, SIZE, { fit: 'fill' })
    .raw()
    .toBuffer()

  const n = gray.length
  if (n === 0) return 0

  // Intensity mean + variance (contrast) for normalization.
  let mean = 0
  for (let i = 0; i < n; i++) mean += gray[i]
  mean /= n
  let intensityVar = 0
  for (let i = 0; i < n; i++) {
    const d = gray[i] - mean
    intensityVar += d * d
  }
  intensityVar /= n
  if (intensityVar < 1e-6) return 0 // flat tone — no detail to speak of

  // Variance of the 4-neighbour Laplacian over the interior pixels.
  let lapMean = 0
  const count = (SIZE - 2) * (SIZE - 2)
  const lap = new Float64Array(count)
  let k = 0
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const idx = y * SIZE + x
      const v =
        gray[idx - SIZE] + gray[idx + SIZE] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx]
      lap[k++] = v
      lapMean += v
    }
  }
  lapMean /= count
  let lapVar = 0
  for (let i = 0; i < count; i++) {
    const d = lap[i] - lapMean
    lapVar += d * d
  }
  lapVar /= count

  // Contrast-normalized focus measure. Scaled up so typical values land in a
  // human-friendly range for the picker badge.
  return (lapVar / intensityVar) * 100
}
