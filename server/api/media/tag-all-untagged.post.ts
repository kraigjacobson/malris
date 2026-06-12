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

    // Per-batch size (one ComfyUI job per batch). Keep upper bound conservative
    // so the tagger worker doesn't choke on a giant FormData payload.
    const batchSize = Math.min(Math.max(body.batchSize || 5, 1), 200)
    // Total cap across all dispatched batches. Defaults to batchSize (single
    // batch behavior — backwards compatible with old callers).
    const totalLimit = Math.min(Math.max(body.totalLimit || batchSize, batchSize), 10000)
    // Optional purpose filter. 'any' / null / undefined means no filter.
    const purposeRaw: unknown = body.purpose
    const purposeFilter: string | null = typeof purposeRaw === 'string' && purposeRaw && purposeRaw !== 'any' && purposeRaw !== 'all' ? purposeRaw : null
    const dryRun = body.dryRun === true

    logger.info(`📦 batchSize=${batchSize} totalLimit=${totalLimit} purpose=${purposeFilter ?? 'any'}${dryRun ? ' (DRY RUN)' : ''}`)

    // "Taggable" predicate:
    //  - any image (any purpose), or
    //  - dest/output videos that have a thumbnail to tag.
    const taggablePredicate = or(
      eq(mediaRecords.type, 'image'),
      and(
        eq(mediaRecords.type, 'video'),
        or(eq(mediaRecords.purpose, 'dest'), eq(mediaRecords.purpose, 'output')),
        isNotNull(mediaRecords.thumbnailUuid)
      )
    )

    // "Untagged" predicate matches the original endpoint semantics.
    const untaggedPredicate = or(isNull(mediaRecords.tags), eq(mediaRecords.tags, '{}'))

    const whereClause = purposeFilter
      ? and(taggablePredicate, untaggedPredicate, eq(mediaRecords.purpose, purposeFilter))
      : and(taggablePredicate, untaggedPredicate)

    const totalUntaggedResult = await db
      .select({ count: count() })
      .from(mediaRecords)
      .where(whereClause)

    const totalUntagged = totalUntaggedResult[0]?.count ?? 0
    logger.info(`📊 Total untagged media${purposeFilter ? ` (purpose=${purposeFilter})` : ''}: ${totalUntagged}`)

    if (totalUntagged === 0) {
      return {
        success: true,
        count: 0,
        batches: 0,
        totalRemaining: 0,
        hasMore: false,
        message: 'No untagged media found'
      }
    }

    const untaggedItems = await db
      .select({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename,
        thumbnailUuid: mediaRecords.thumbnailUuid,
        type: mediaRecords.type,
        purpose: mediaRecords.purpose
      })
      .from(mediaRecords)
      .where(whereClause)
      .limit(totalLimit)

    const willProcess = untaggedItems.length
    const batches: typeof untaggedItems[] = []
    for (let i = 0; i < willProcess; i += batchSize) {
      batches.push(untaggedItems.slice(i, i + batchSize))
    }
    logger.info(`🎬 Will dispatch ${batches.length} batch(es) covering ${willProcess} item(s); ${totalUntagged - willProcess} remain beyond totalLimit`)

    // Fire-and-forget background dispatch. Each batch becomes its own ComfyUI
    // tagging job. ComfyUI handles its own queue; the existing queue-status
    // poller on the utilities page will show progress as tags land.
    const { collectImagesForTagging, dispatchTaggingBatch } = await import('~/server/utils/tagging')
    void (async () => {
      let dispatched = 0
      let failed = 0
      for (const batch of batches) {
        try {
          const taggable = await collectImagesForTagging(batch)
          if (taggable.length === 0) {
            logger.warn(`⚠️ Batch produced 0 taggable images, skipping`)
            continue
          }
          const result = await dispatchTaggingBatch(taggable, db, { dryRun })
          if (result.success) {
            dispatched++
            logger.info(`✅ Background dispatch progress: ${dispatched}/${batches.length} batches (job ${result.jobId})`)
          } else {
            failed++
            logger.error(`❌ Background dispatch: batch failed`)
          }
        } catch (err) {
          failed++
          logger.error(`❌ Background dispatch error:`, err)
        }
      }
      logger.info(`🏁 Background dispatch finished: ${dispatched} succeeded, ${failed} failed`)
    })().catch(err => logger.error('❌ Background dispatch loop crashed:', err))

    const totalRemaining = totalUntagged - willProcess
    return {
      success: true,
      count: willProcess,
      batches: batches.length,
      batchSize,
      totalRemaining,
      hasMore: totalRemaining > 0,
      message: `Queued ${willProcess} item(s) across ${batches.length} batch(es) of ${batchSize}. ${totalRemaining} item(s) remain after this run.`
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
