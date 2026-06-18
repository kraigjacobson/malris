/**
 * Helpers for face embeddings used by the "sort by face similarity" feature.
 *
 * Embeddings come from the CPU InsightFace `face-embed` service as arrays of
 * 512 float32s, already L2-normalized (so a dot product is cosine similarity).
 * We store them as a compact little-endian float32 bytea on
 * media_records.face_embedding and reorder in JS at query time.
 */

export const FACE_EMBED_DIM = 512

/** Pack a 512-float embedding into a little-endian float32 Buffer for bytea storage. */
export function vecToBuf(vec: number[]): Buffer {
  const f32 = Float32Array.from(vec)
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)
}

/** Unpack a stored bytea embedding back into a Float32Array (or null if malformed). */
export function bufToVec(buf: Buffer | Uint8Array | null | undefined): Float32Array | null {
  if (!buf || buf.byteLength === 0) return null
  // Copy into an aligned buffer — bytea Buffers can be offset views into a pool.
  const copy = Buffer.from(buf)
  if (copy.byteLength % 4 !== 0) return null
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4)
}

/** Cosine similarity of two already-normalized vectors (plain dot product). */
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

/**
 * Mean of several vectors, L2-normalized. Used to build a single robust query
 * vector from multiple selected images. Returns null if no vectors given.
 */
export function meanNormalized(vecs: Float32Array[]): Float32Array | null {
  if (vecs.length === 0) return null
  const dim = vecs[0].length
  const acc = new Float32Array(dim)
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) acc[i] += v[i]
  }
  let norm = 0
  for (let i = 0; i < dim; i++) norm += acc[i] * acc[i]
  norm = Math.sqrt(norm)
  if (norm === 0) return null
  for (let i = 0; i < dim; i++) acc[i] /= norm
  return acc
}

/**
 * Greedy nearest-neighbour tour: returns the input items reordered so each item
 * is followed by its most-similar not-yet-placed neighbour. The result is a
 * single chain where visually-alike faces sit adjacent — exactly what makes
 * "grab a whole person" easy in the grid.
 *
 * O(n^2) but the vectors are tiny and per-subject sets are small (<=1000), so
 * this is a few hundred thousand dot products — effectively instant.
 *
 * Starts from index 0 of `items` (callers pass a deterministic input order, e.g.
 * created_at, so the tour itself is deterministic).
 */
export function nearestNeighborTour<T extends { vec: Float32Array }>(items: T[]): T[] {
  const n = items.length
  if (n <= 2) return items.slice()

  const visited = new Array<boolean>(n).fill(false)
  const order: T[] = []

  let current = 0
  visited[0] = true
  order.push(items[0])

  for (let step = 1; step < n; step++) {
    let best = -1
    let bestSim = -Infinity
    const cur = items[current].vec
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue
      const sim = dot(cur, items[j].vec)
      if (sim > bestSim) {
        bestSim = sim
        best = j
      }
    }
    if (best === -1) break
    visited[best] = true
    order.push(items[best])
    current = best
  }

  return order
}
