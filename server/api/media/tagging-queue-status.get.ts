import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, isNull, isNotNull, or, count } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

// Import queue state from tag-all-untagged
import { getQueueStatus } from '~/server/api/media/tag-all-untagged.post'

export default defineEventHandler(async (_event) => {
  try {
    const db = getDb()
    
    // Get total untagged dest videos with thumbnails
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
    
    // Get current queue status
    const queueStatus = getQueueStatus()
    
    return {
      success: true,
      totalUntagged,
      queueLength: queueStatus.queueLength,
      isProcessing: queueStatus.isProcessing,
      currentBatch: queueStatus.currentBatch
    }
    
  } catch (error: any) {
    logger.error('❌ Error getting queue status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to get queue status'
    })
  }
})