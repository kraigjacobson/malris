import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, isNull, isNotNull, or, count } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

// Global state for tagging queue management (simplified for batch processing)
const currentBatchInfo = { processed: 0, total: 0, errors: 0 }

export default defineEventHandler(async (event) => {
  try {
    logger.info('🏷️ Starting tag-all-untagged process...')
    
    const db = getDb()
    const body = await readBody(event).catch(() => ({}))

    // Get batch size from request body, default to 5, min 1, max 100
    const batchSize = Math.min(Math.max(body.batchSize || 5, 1), 100)
    const dryRun = body.dryRun === true
    logger.info(`📦 Processing batch size: ${batchSize}${dryRun ? ' (DRY RUN)' : ''}`)
    
    // First check total count of untagged dest videos with thumbnails
    const totalUntaggedResult = await db
      .select({ count: count() })
      .from(mediaRecords)
      .where(
        and(
          eq(mediaRecords.type, 'video'),
          eq(mediaRecords.purpose, 'dest'),
          isNotNull(mediaRecords.thumbnailUuid),
          or(
            isNull(mediaRecords.tags),
            eq(mediaRecords.tags, '{}')
          )
        )
      )

    const totalUntagged = totalUntaggedResult[0]?.count ?? 0
    logger.info(`📊 Total untagged media: ${totalUntagged}`)
    
    if (totalUntagged === 0) {
      logger.info('✅ No untagged media found')
      return {
        success: true,
        count: 0,
        totalRemaining: 0,
        hasMore: false,
        message: 'No untagged media found'
      }
    }
    
    // Get next batch of untagged dest videos with thumbnails
    const untaggedVideos = await db
      .select({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename,
        thumbnailUuid: mediaRecords.thumbnailUuid,
        type: mediaRecords.type,
        purpose: mediaRecords.purpose
      })
      .from(mediaRecords)
      .where(
        and(
          eq(mediaRecords.type, 'video'),
          eq(mediaRecords.purpose, 'dest'),
          isNotNull(mediaRecords.thumbnailUuid),
          or(
            isNull(mediaRecords.tags),
            eq(mediaRecords.tags, '{}')
          )
        )
      )
      .limit(batchSize)
    
    const batchCount = untaggedVideos.length
    const remainingAfterBatch = totalUntagged - batchCount
    const hasMore = remainingAfterBatch > 0
    
    logger.info(`🎬 Processing batch of ${batchCount} media items (${remainingAfterBatch} total remaining after this batch)`)
    
    // Get thumbnail data for batch processing
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
    if (!encryptionKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media encryption key not configured'
      })
    }
    
    // Collect image data for batch processing (video thumbnails + subject hero images)
    const mediaWithImages = await collectThumbnailsForBatch(untaggedVideos, encryptionKey)
    
    logger.info(`🖼️ Successfully collected ${mediaWithImages.length} images for batch processing`)
    
    // Send batch to ComfyUI for processing
    if (mediaWithImages.length > 0) {
      const success = await sendBatchToComfyUIForTagging(mediaWithImages, db, dryRun)
      if (!success) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to submit batch for tagging'
        })
      }
    }
    
    // Return immediately with batch info
    return {
      success: true,
      count: batchCount,
      totalRemaining: remainingAfterBatch,
      hasMore: hasMore,
      message: `Started tagging process for ${batchCount} media items. ${remainingAfterBatch} total items remaining.`
    }
    
  } catch (error: any) {
    logger.error('❌ Error in tag-all-untagged:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to start tagging process'
    })
  }
})

/**
 * Collect thumbnail data for batch processing
 */
async function collectThumbnailsForBatch(mediaItems: any[], _encryptionKey: string): Promise<Array<{uuid: string, filename: string, thumbnailBase64: string}>> {
  const { retrieveMedia } = await import('~/server/services/hybridMediaStorage')
  const mediaWithImages = []
  
  for (const media of mediaItems) {
    try {
      let imageUuid = null
      let imageType = ''
      
      if (media.type === 'video' && media.purpose === 'dest') {
        // For dest videos, use their thumbnail
        if (!media.thumbnailUuid) {
          logger.warn(`⚠️ Dest video ${media.uuid} has no thumbnail UUID, skipping`)
          continue
        }
        imageUuid = media.thumbnailUuid
        imageType = 'video thumbnail'
      } else if (media.type === 'image' && media.purpose === 'source') {
        // For source images (subject images), use the image itself
        imageUuid = media.uuid
        imageType = 'source image'
      } else {
        logger.warn(`⚠️ Unsupported media type/purpose: ${media.type}/${media.purpose}, skipping`)
        continue
      }
      
      logger.info(`🖼️ Retrieving ${imageType} for ${media.uuid} (image: ${imageUuid})`)
      
      // Retrieve the image data using the hybrid storage service
      const imageData = await retrieveMedia(imageUuid)
      if (!imageData) {
        logger.warn(`⚠️ No image data found for ${media.uuid}`)
        continue
      }
      
      const imageBase64 = imageData.toString('base64')
      
      mediaWithImages.push({
        uuid: media.uuid,
        filename: media.filename,
        thumbnailBase64: imageBase64
      })
      
      logger.info(`✅ Successfully retrieved ${imageType} for ${media.uuid} (${imageBase64.length} chars)`)
      
    } catch (error) {
      logger.error(`❌ Error retrieving image for ${media.uuid}:`, error)
      // Continue with other media items
    }
  }
  
  return mediaWithImages
}

/**
 * Send batch of thumbnails to ComfyUI for tagging using directory-based batch workflow
 */
async function sendBatchToComfyUIForTagging(videosWithThumbnails: Array<{uuid: string, filename: string, thumbnailBase64: string}>, db: any, dryRun: boolean = false): Promise<boolean> {
  try {
    logger.info(`🔥 [COMFYUI-BATCH-SUBMIT] ===== SENDING BATCH TO COMFYUI =====`)
    logger.info(`🔥 [COMFYUI-BATCH-SUBMIT] Batch size: ${videosWithThumbnails.length} videos`)
    
    // Get ComfyUI worker URL from environment
    const comfyUIUrl = process.env.COMFYUI_WORKER_URL || process.env.COMFYUI_URL || 'http://localhost:8001'
    logger.info(`🔥 [COMFYUI-BATCH-SUBMIT] ComfyUI URL: ${comfyUIUrl}`)
    
    // Use a proper UUID for the batch job ID
    const { randomUUID } = await import('crypto')
    const batchJobId = randomUUID()
    logger.info(`🔥 [COMFYUI-BATCH-SUBMIT] Batch Job ID: ${batchJobId}`)
    
    // Create a temporary job record for the batch tagging operation
    const { jobs, subjects } = await import('~/server/utils/schema')
    
    // Get a subject UUID for the job (required field) - use first available subject
    const firstSubject = await db.select({ id: subjects.id }).from(subjects).limit(1)
    const subjectUuid = firstSubject.length > 0 ? firstSubject[0].id : null
    
    if (!subjectUuid) {
      throw new Error('No subjects found in database - cannot create batch tagging job')
    }
    
    await db.insert(jobs).values({
      id: batchJobId,
      jobType: 'tagging', // Unified tagging job type (supports single and batch)
      status: 'active',
      subjectUuid: subjectUuid, // Use first available subject
      sourceMediaUuid: null, // No specific source media for batch
      destMediaUuid: videosWithThumbnails[0].uuid, // Use first media item as destination (required field)
      createdAt: new Date(),
      updatedAt: new Date()
    })
    
    logger.info(`✅ Created temporary job record for batch tagging: ${batchJobId}`)
    
    // Prepare the request data for ComfyUI tagging workflow
    // Use batch_images JSON format: { uuid: base64, ... }
    const batchImages: Record<string, string> = {}
    for (const video of videosWithThumbnails) {
      batchImages[video.uuid] = video.thumbnailBase64
    }

    const formData = new FormData()
    formData.append('job_type', 'tagging')
    formData.append('workflow_type', 'tagging')
    formData.append('job_id', batchJobId)
    formData.append('batch_images', JSON.stringify(batchImages))
    formData.append('threshold', '0.35')
    formData.append('character_threshold', '0.85')
    formData.append('exclude_tags', '')
    formData.append('dry_run', dryRun ? 'true' : 'false')

    logger.info(`🔥 [COMFYUI-BATCH-SUBMIT] Sending ${videosWithThumbnails.length} images via batch_images JSON`)
    
    // Send request to ComfyUI
    logger.info(`🔥 [COMFYUI-BATCH-SUBMIT] Making POST request to: ${comfyUIUrl}/process`)
    const response = await fetch(`${comfyUIUrl}/process`, {
      method: 'POST',
      body: formData
    })
    
    logger.info(`🔥 [COMFYUI-BATCH-SUBMIT] Response status: ${response.status} ${response.statusText}`)
    
    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`❌ [COMFYUI-BATCH-SUBMIT] ComfyUI batch request failed:`, response.status, response.statusText)
      logger.error(`❌ [COMFYUI-BATCH-SUBMIT] Error response body:`, errorText)
      return false
    }
    
    const result = await response.json()
    logger.info(`🔥 [COMFYUI-BATCH-SUBMIT] ComfyUI response body:`, JSON.stringify(result, null, 2))
    logger.info(`✅ [COMFYUI-BATCH-SUBMIT] ComfyUI accepted batch tagging job for ${videosWithThumbnails.length} videos`)
    
    return true
    
  } catch (error) {
    logger.error(`❌ Error sending batch to ComfyUI:`, error)
    return false
  }
}

/**
 * Called when tagging results are received (simplified for batch processing)
 */
export function onTaggingComplete() {
  currentBatchInfo.processed++
  logger.info(`✅ Tagging completed. Progress: ${currentBatchInfo.processed}/${currentBatchInfo.total}, ${currentBatchInfo.errors} errors`)
}

/**
 * Get current queue status for UI display
 */
export function getQueueStatus() {
  return {
    queueLength: 0, // No longer using queue
    isProcessing: false, // Simplified for batch processing
    currentBatch: {
      processed: currentBatchInfo.processed,
      total: currentBatchInfo.total,
      errors: currentBatchInfo.errors
    }
  }
}
