/**
 * Shared helpers for batch tagging dispatch.
 *
 * Used by both the "tag all untagged" sweep and the explicit tag-batch
 * endpoint (when the UI hands us a specific list of media UUIDs to tag).
 *
 * Tagging jobs bypass the continuous job picker — they're dispatched directly
 * to the tagger worker as fire-and-forget. A temporary `jobs` row is created
 * so the worker has somewhere to POST back its tag_results when finished.
 */
import { logger } from '~/server/utils/logger'

export interface MediaForTagging {
  uuid: string
  filename: string
  type: string         // 'video' | 'image'
  purpose: string      // 'dest' | 'output' | 'source' | ...
  thumbnailUuid: string | null
}

export interface TaggableImage {
  uuid: string
  filename: string
  thumbnailBase64: string
}

/**
 * For each candidate media record, resolve the actual image bytes to tag:
 * - videos: read the thumbnail (must have one)
 * - images: read the image itself
 *
 * Records whose underlying image can't be retrieved are skipped (logged, not thrown).
 */
export async function collectImagesForTagging(mediaItems: MediaForTagging[]): Promise<TaggableImage[]> {
  const { retrieveMedia } = await import('~/server/services/hybridMediaStorage')
  const taggable: TaggableImage[] = []

  for (const media of mediaItems) {
    try {
      let imageUuid: string | null = null
      let label = ''

      if (media.type === 'video' && (media.purpose === 'dest' || media.purpose === 'output')) {
        if (!media.thumbnailUuid) {
          logger.warn(`⚠️ ${media.purpose} video ${media.uuid} has no thumbnail UUID, skipping`)
          continue
        }
        imageUuid = media.thumbnailUuid
        label = `${media.purpose} video thumbnail`
      } else if (media.type === 'image') {
        imageUuid = media.uuid
        label = `${media.purpose} image`
      } else {
        logger.warn(`⚠️ Unsupported media type/purpose: ${media.type}/${media.purpose} for ${media.uuid}, skipping`)
        continue
      }

      logger.info(`🖼️ Retrieving ${label} for ${media.uuid} (image: ${imageUuid})`)
      const imageData = await retrieveMedia(imageUuid)
      if (!imageData) {
        logger.warn(`⚠️ No image data found for ${media.uuid}`)
        continue
      }

      const imageBase64 = imageData.toString('base64')
      taggable.push({ uuid: media.uuid, filename: media.filename, thumbnailBase64: imageBase64 })
      logger.info(`✅ Retrieved ${label} for ${media.uuid} (${imageBase64.length} chars)`)
    } catch (error) {
      logger.error(`❌ Error retrieving image for ${media.uuid}:`, error)
    }
  }

  return taggable
}

/**
 * Dispatch a batch of images to the tagger worker. Creates a temporary
 * `jobs` row (status='active') so the worker has a callback target, then
 * POSTs the images as `batch_images` JSON to /process.
 *
 * Returns true if the worker accepted the batch (does NOT wait for tagging
 * to finish — the worker POSTs results back to /api/jobs/{id}/outputs).
 */
export async function dispatchTaggingBatch(
  images: TaggableImage[],
  db: any,
  options: { dryRun?: boolean; threshold?: number; characterThreshold?: number; excludeTags?: string } = {}
): Promise<{ success: boolean; jobId: string | null }> {
  if (images.length === 0) {
    return { success: false, jobId: null }
  }

  try {
    logger.info(`🔥 [TAG-BATCH] ===== DISPATCHING BATCH =====`)
    logger.info(`🔥 [TAG-BATCH] Batch size: ${images.length} images`)

    // Prefer the dedicated tagger worker so the main worker doesn't have to
    // unload Wan/ReActor checkpoints to load WD14.
    const taggerUrl = process.env.TAGGER_WORKER_URL || process.env.COMFYUI_WORKER_URL || process.env.COMFYUI_URL || 'http://localhost:8001'
    logger.info(`🔥 [TAG-BATCH] Tagger URL: ${taggerUrl}`)

    const { randomUUID } = await import('crypto')
    const batchJobId = randomUUID()
    logger.info(`🔥 [TAG-BATCH] Batch Job ID: ${batchJobId}`)

    // Temporary job record (callback target for the worker's POST /outputs).
    // subjectUuid is a required column; we just borrow any existing subject's id.
    const { jobs, subjects } = await import('~/server/utils/schema')
    const firstSubject = await db.select({ id: subjects.id }).from(subjects).limit(1)
    const subjectUuid = firstSubject.length > 0 ? firstSubject[0].id : null
    if (!subjectUuid) {
      throw new Error('No subjects found in database - cannot create batch tagging job')
    }

    await db.insert(jobs).values({
      id: batchJobId,
      jobType: 'tagging',
      status: 'active',
      subjectUuid,
      sourceMediaUuid: null,
      destMediaUuid: images[0].uuid, // required FK; first item is fine
      createdAt: new Date(),
      updatedAt: new Date()
    })
    logger.info(`✅ Created temporary tagging job: ${batchJobId}`)

    // batch_images JSON: { uuid: base64, ... }
    const batchImages: Record<string, string> = {}
    for (const img of images) {
      batchImages[img.uuid] = img.thumbnailBase64
    }

    const formData = new FormData()
    formData.append('job_type', 'tagging')
    formData.append('workflow_type', 'tagging')
    formData.append('job_id', batchJobId)
    formData.append('batch_images', JSON.stringify(batchImages))
    formData.append('threshold', String(options.threshold ?? 0.35))
    formData.append('character_threshold', String(options.characterThreshold ?? 0.85))
    formData.append('exclude_tags', options.excludeTags ?? '')
    formData.append('dry_run', options.dryRun ? 'true' : 'false')

    logger.info(`🔥 [TAG-BATCH] POST ${taggerUrl}/process with ${images.length} images`)
    const response = await fetch(`${taggerUrl}/process`, { method: 'POST', body: formData })
    logger.info(`🔥 [TAG-BATCH] Response: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`❌ [TAG-BATCH] Worker rejected batch:`, response.status, errorText)
      return { success: false, jobId: batchJobId }
    }

    const result = await response.json()
    logger.info(`✅ [TAG-BATCH] Worker accepted batch: ${JSON.stringify(result)}`)
    return { success: true, jobId: batchJobId }
  } catch (error) {
    logger.error(`❌ Error dispatching tagging batch:`, error)
    return { success: false, jobId: null }
  }
}
