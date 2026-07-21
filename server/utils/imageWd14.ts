/**
 * Client for the standalone WD14 tagger sidecar (comfy-docker/wd14_tagger).
 * POSTs a {uuid: base64} batch and returns the FULL booru tag set + NSFW rating
 * per image — the complete vocabulary the concept tag-search needs (as opposed
 * to malris's in-app allowlisted tagging). Mirrors imageCaption.ts.
 */
import { logger } from '~/server/utils/logger'

export const WD14_WORKER_URL = process.env.WD14_WORKER_URL || 'http://wd14-tagger:8000'

export interface Wd14Item {
  rating: Record<string, number>
  top_rating: string | null
  general: Record<string, number>
  character: Record<string, number>
  tags: string[] // general + character, most-confident first
}

export interface Wd14Result {
  results: Record<string, Wd14Item>
  errors: Record<string, string>
}

/** POST a {uuid: base64} map to the tagger; returns its per-image results + errors. */
export async function tagBatch(
  images: Record<string, string>,
  opts: { generalThreshold?: number; characterThreshold?: number; timeoutMs?: number } = {}
): Promise<Wd14Result> {
  const timeoutMs = opts.timeoutMs ?? 180_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const body: Record<string, unknown> = { images }
    if (typeof opts.generalThreshold === 'number') body.general_threshold = opts.generalThreshold
    if (typeof opts.characterThreshold === 'number') body.character_threshold = opts.characterThreshold
    const res = await fetch(`${WD14_WORKER_URL}/tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`wd14 ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as Wd14Result
    return { results: data.results || {}, errors: data.errors || {} }
  } finally {
    clearTimeout(timer)
  }
}

/** Best-effort health probe so the compute endpoint can fail fast + clearly. */
export async function wd14Healthy(timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${WD14_WORKER_URL}/health`, { signal: controller.signal })
    return res.ok
  } catch (err) {
    logger.warn(`wd14: health check failed for ${WD14_WORKER_URL}: ${err instanceof Error ? err.message : err}`)
    return false
  } finally {
    clearTimeout(timer)
  }
}
