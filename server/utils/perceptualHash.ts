/**
 * Pure-CPU perceptual hashing for near-duplicate image detection.
 *
 * No AI, no GPU, no new dependencies — just `sharp` (already a project dep)
 * to decode + downscale to grayscale, then plain bit math. Three signals:
 *
 *   dHash  64-bit difference hash of the whole image. Robust to resize,
 *          aspect tweaks, brightness/contrast. Cheap, near-zero false +ve.
 *   pHash  64-bit DCT perceptual hash of the whole image. Robust to
 *          re-encode / recompression / blur / watermark.
 *   tiles  per-tile dHashes over a TILE_GRID×TILE_GRID grid. Best-effort
 *          crop catch: a crop preserves a subset of tiles, so two images
 *          sharing enough near-identical tiles are flagged as possible crops.
 *          (Honest caveat: fixed-grid tiling handles border/partial/aligned
 *          crops well and arbitrary off-grid crops less reliably. The pair
 *          finder treats tile matches as a separate, lower-confidence signal.)
 *
 * All hashes are 64-bit, stored as 8 raw bytes (dhash/phash columns) or as
 * 16-char hex strings (tile_hashes jsonb array).
 */
import sharp from 'sharp'

// dHash works on a (W+1)×H grayscale image: each of the W horizontal
// adjacent-pixel comparisons across H rows yields one bit (W*H = 64).
const DHASH_W = 8
const DHASH_H = 8

// pHash works on a PHASH_SIZE×PHASH_SIZE grayscale image; we keep the
// top-left 8×8 of its DCT (low frequencies).
const PHASH_SIZE = 32
const PHASH_LOW = 8

// Crop tiling: TILE_GRID×TILE_GRID tiles, each producing its own 64-bit dHash.
export const TILE_GRID = 4

export interface PerceptualHashes {
  dhash: Buffer // 8 bytes
  phash: Buffer // 8 bytes
  tileHashes: string[] // TILE_GRID*TILE_GRID hex strings (16 chars each)
}

// popcount lookup for a single byte
const POPCOUNT = new Uint8Array(256)
for (let i = 0; i < 256; i++) {
  POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1]
}

/** Hamming distance between two 8-byte hash buffers (0..64). */
export function hammingDistanceBuf(a: Buffer, b: Buffer): number {
  let d = 0
  for (let i = 0; i < 8; i++) d += POPCOUNT[a[i] ^ b[i]]
  return d
}

/** Hamming distance between two 16-char hex hashes (0..64). */
export function hammingDistanceHex(a: string, b: string): number {
  let d = 0
  for (let i = 0; i < 16; i += 2) {
    const xa = parseInt(a.slice(i, i + 2), 16)
    const xb = parseInt(b.slice(i, i + 2), 16)
    d += POPCOUNT[xa ^ xb]
  }
  return d
}

/**
 * Count how many of `a`'s tiles have a close (<= tolerance Hamming) match
 * among `b`'s tiles. Symmetric enough for our purposes.
 *
 * Buffer variant: callers pre-parse each image's tile hex strings into 8-byte
 * Buffers ONCE (parseTileHashes) so the O(n²·tiles²) comparison hot loop does
 * raw byte XOR + popcount instead of re-parsing hex on every comparison.
 */
export function tileMatchCountBuf(a: Buffer[], b: Buffer[], tolerance: number): number {
  if (!a?.length || !b?.length) return 0
  let matches = 0
  for (const ta of a) {
    for (const tb of b) {
      if (hammingDistanceBuf(ta, tb) <= tolerance) {
        matches++
        break
      }
    }
  }
  return matches
}

// Pixel-level refinement: decode an image to a fixed grayscale grid so two
// images can be compared pixel-for-pixel regardless of original size.
const SIG_SIZE = 128

/** Decode an image to a SIG_SIZE×SIG_SIZE grayscale buffer (a "signature"). */
export async function pixelSignature(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer, { failOn: 'none' })
    .grayscale()
    .resize(SIG_SIZE, SIG_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer()
}

/**
 * Percentage (0-100) of pixels that differ by more than `threshold` between two
 * signatures. True re-encode duplicates score ~0 (only JPEG/resample noise);
 * genuinely different frames score higher because a real region changed.
 */
export function pixelDiffPercent(a: Buffer, b: Buffer, threshold = 25): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 100
  let changed = 0
  for (let i = 0; i < n; i++) {
    if (Math.abs(a[i] - b[i]) > threshold) changed++
  }
  return (100 * changed) / n
}

/** Pre-parse a tile_hashes hex array into 8-byte Buffers for fast comparison. */
export function parseTileHashes(hexes: string[] | null | undefined): Buffer[] | null {
  if (!Array.isArray(hexes) || hexes.length === 0) return null
  return hexes.map((h) => Buffer.from(h, 'hex'))
}

/** Pack 64 booleans (MSB-first per byte) into an 8-byte buffer. */
function bitsToBuffer(bits: boolean[]): Buffer {
  const out = Buffer.alloc(8)
  for (let i = 0; i < 64; i++) {
    if (bits[i]) out[i >> 3] |= 0x80 >> (i & 7)
  }
  return out
}

function bitsToHex(bits: boolean[]): string {
  return bitsToBuffer(bits).toString('hex')
}

/** dHash from a raw single-channel buffer of (w+? ) — here a (DHASH_W+? )... */
function dhashFromGray(gray: Buffer, w: number, h: number): boolean[] {
  // Compare each pixel to its right neighbour. Source is (w)×(h); we produce
  // (w-1) bits per row. Callers size the image so (w-1)*h === 64.
  const bits: boolean[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      bits.push(gray[y * w + x] < gray[y * w + x + 1])
    }
  }
  return bits
}

/** Naive separable DCT-II of an N×N grayscale buffer. N is small (32). */
function dct2d(input: number[], n: number): number[] {
  // Precompute cosine table.
  const cos: number[][] = []
  for (let u = 0; u < n; u++) {
    cos[u] = []
    for (let x = 0; x < n; x++) {
      cos[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * n))
    }
  }
  // Rows then columns.
  const tmp = new Array(n * n).fill(0)
  for (let y = 0; y < n; y++) {
    for (let u = 0; u < n; u++) {
      let s = 0
      for (let x = 0; x < n; x++) s += input[y * n + x] * cos[u][x]
      tmp[y * n + u] = s
    }
  }
  const out = new Array(n * n).fill(0)
  for (let u = 0; u < n; u++) {
    for (let v = 0; v < n; v++) {
      let s = 0
      for (let y = 0; y < n; y++) s += tmp[y * n + v] * cos[u][y]
      out[u * n + v] = s
    }
  }
  return out
}

/** Compute all three perceptual hashes for an encoded image buffer. */
export async function computeHashes(imageBuffer: Buffer): Promise<PerceptualHashes> {
  // failOn: 'none' lets libvips decode truncated / mildly-corrupt JPEGs/PNGs
  // (common in this library) instead of throwing. A partial decode still
  // yields a usable perceptual fingerprint — and broken files are themselves
  // strong duplicate candidates, so we very much want to hash them.
  const open = { failOn: 'none' as const }

  // --- dHash: (DHASH_W+1)×DHASH_H grayscale ---
  const dGray = await sharp(imageBuffer, open)
    .grayscale()
    .resize(DHASH_W + 1, DHASH_H, { fit: 'fill' })
    .raw()
    .toBuffer()
  const dhash = bitsToBuffer(dhashFromGray(dGray, DHASH_W + 1, DHASH_H))

  // --- pHash: PHASH_SIZE×PHASH_SIZE grayscale -> DCT -> top-left 8×8 ---
  const pGray = await sharp(imageBuffer, open)
    .grayscale()
    .resize(PHASH_SIZE, PHASH_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer()
  const pixels = Array.from(pGray as Buffer, (v) => v as number)
  const dct = dct2d(pixels, PHASH_SIZE)
  // Collect the low-frequency PHASH_LOW×PHASH_LOW block, excluding the DC term
  // [0,0] from the median so a flat tone doesn't bias every bit.
  const low: number[] = []
  for (let u = 0; u < PHASH_LOW; u++) {
    for (let v = 0; v < PHASH_LOW; v++) low.push(dct[u * PHASH_SIZE + v])
  }
  const medianSrc = low.slice(1).sort((a, b) => a - b)
  const median = medianSrc[medianSrc.length >> 1]
  const phash = bitsToBuffer(low.map((c) => c > median))

  // --- tiles: resize whole image so each tile region is (DHASH_W+1)×DHASH_H ---
  const tileW = DHASH_W + 1
  const tileH = DHASH_H
  const tGray = await sharp(imageBuffer, open)
    .grayscale()
    .resize(TILE_GRID * tileW, TILE_GRID * tileH, { fit: 'fill' })
    .raw()
    .toBuffer()
  const gridW = TILE_GRID * tileW
  const tileHashes: string[] = []
  for (let ty = 0; ty < TILE_GRID; ty++) {
    for (let tx = 0; tx < TILE_GRID; tx++) {
      const bits: boolean[] = []
      for (let y = 0; y < tileH; y++) {
        const row = (ty * tileH + y) * gridW + tx * tileW
        for (let x = 0; x < tileW - 1; x++) {
          bits.push(tGray[row + x] < tGray[row + x + 1])
        }
      }
      tileHashes.push(bitsToHex(bits))
    }
  }

  return { dhash, phash, tileHashes }
}
