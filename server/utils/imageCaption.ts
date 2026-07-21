/**
 * Client for the standalone Florence-2 captioner sidecar
 * (comfy-docker/florence_captioner). POSTs a {uuid: base64} batch and returns
 * the natural-language captions used for Wan LoRA training.
 */
import { logger } from '~/server/utils/logger'

export const CAPTION_WORKER_URL = process.env.CAPTION_WORKER_URL || 'http://florence-captioner:8000'

export interface CaptionResult {
  captions: Record<string, string>
  errors: Record<string, string>
}

/** POST a {uuid: base64} map to the captioner; returns its captions + errors. */
export async function captionBatch(
  images: Record<string, string>,
  opts: { task?: string; timeoutMs?: number } = {}
): Promise<CaptionResult> {
  const task = opts.task || 'more_detailed_caption'
  const timeoutMs = opts.timeoutMs ?? 180_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${CAPTION_WORKER_URL}/caption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, task }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`captioner ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as CaptionResult
    return { captions: data.captions || {}, errors: data.errors || {} }
  } finally {
    clearTimeout(timer)
  }
}

/** Best-effort health probe so the compute endpoint can fail fast + clearly. */
export async function captionerHealthy(timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${CAPTION_WORKER_URL}/health`, { signal: controller.signal })
    return res.ok
  } catch (err) {
    logger.warn(`caption: health check failed for ${CAPTION_WORKER_URL}: ${err instanceof Error ? err.message : err}`)
    return false
  } finally {
    clearTimeout(timer)
  }
}
