import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, isNull, isNotNull, or, count } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

// Import queue state from tag-all-untagged
import { getQueueStatus } from '~/server/api/media/tag-all-untagged.post'

export default defineEventHandler(async (event) => {
  try {
    const db = getDb()

    // Optional purpose filter. 'any' / null / undefined / 'all' means no filter.
    // Keep this filter logic in sync with tag-all-untagged.post.ts so the count
    // matches what would actually be queued.
    const query = getQuery(event)
    const purposeRaw = query.purpose
    const purposeFilter: string | null =
      typeof purposeRaw === 'string' && purposeRaw && purposeRaw !== 'any' && purposeRaw !== 'all'
        ? purposeRaw
        : null

    const taggablePredicate = or(
      eq(mediaRecords.type, 'image'),
      and(
        eq(mediaRecords.type, 'video'),
        or(eq(mediaRecords.purpose, 'dest'), eq(mediaRecords.purpose, 'output')),
        isNotNull(mediaRecords.thumbnailUuid)
      )
    )

    const untaggedPredicate = or(isNull(mediaRecords.tags), eq(mediaRecords.tags, '{}'))

    const whereClause = purposeFilter
      ? and(taggablePredicate, untaggedPredicate, eq(mediaRecords.purpose, purposeFilter))
      : and(taggablePredicate, untaggedPredicate)

    const totalUntaggedResult = await db
      .select({ count: count() })
      .from(mediaRecords)
      .where(whereClause)

    const totalUntagged = totalUntaggedResult[0]?.count ?? 0

    // Get current queue status
    const queueStatus = getQueueStatus()

    return {
      success: true,
      totalUntagged,
      purpose: purposeFilter ?? 'any',
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
