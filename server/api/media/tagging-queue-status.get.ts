import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, isNull, or } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

// Import queue state from tag-all-untagged
import { getQueueStatus } from '~/server/api/media/tag-all-untagged.post'

export default defineEventHandler(async (_event) => {
  try {
    const db = getDb()
    
    // Get total untagged videos count
    const totalUntaggedCount = await db
      .select({ count: mediaRecords.uuid })
      .from(mediaRecords)
      .where(
        and(
          eq(mediaRecords.type, 'video'),
          eq(mediaRecords.purpose, 'dest'),
          or(
            isNull(mediaRecords.tags),
            eq(mediaRecords.tags, '{}')
          )
        )
      )
    
    const totalUntagged = totalUntaggedCount.length
    
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