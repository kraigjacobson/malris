import { logger } from '~/server/utils/logger'
import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, sql, inArray } from 'drizzle-orm'

const BATCH_SIZE = 100

// Simple in-memory flag
let isCleanupRunning = false
let shouldCancel = false

export function isRunning() {
  return isCleanupRunning
}

export function requestCancel() {
  shouldCancel = true
}

async function cleanupOrphanedImages() {
  const db = getDb()

  try {
    isCleanupRunning = true
    shouldCancel = false

    logger.info('Starting orphaned images cleanup')

    // Delete in batches until nothing left
    let batchDeleted = 0
    let totalDeleted = 0
    let batchNumber = 0

    do {
      batchNumber++

      // Check for cancel request
      if (shouldCancel) {
        logger.info('Cleanup cancelled by user')
        break
      }

      logger.info(`Processing batch ${batchNumber}, deleting up to ${BATCH_SIZE} images...`)

      try {
        // Find orphaned images to delete in this batch
        logger.info('Querying for orphaned images...')
        const orphanedImages = await db
          .select({ uuid: mediaRecords.uuid })
          .from(mediaRecords)
          .where(
            and(
              eq(mediaRecords.purpose, 'output'),
              eq(mediaRecords.type, 'image'),
              sql`${mediaRecords.uuid} NOT IN (
                SELECT thumbnail_uuid
                FROM media_records
                WHERE thumbnail_uuid IS NOT NULL
              )`,
              sql`${mediaRecords.jobId} IN (
                SELECT id FROM jobs
                WHERE status IN ('completed', 'failed')
                OR (status = 'queued' AND source_media_uuid IS NOT NULL)
              )`
            )
          )
          .limit(BATCH_SIZE)

        logger.info(`Query returned ${orphanedImages.length} orphaned images`)

        batchDeleted = orphanedImages.length

        // Delete the found images if any
        if (batchDeleted > 0) {
          logger.info(`Deleting ${batchDeleted} images...`)
          const uuidsToDelete = orphanedImages.map(img => img.uuid)
          await db.delete(mediaRecords).where(inArray(mediaRecords.uuid, uuidsToDelete))
          logger.info('Delete operation completed')
        }
        totalDeleted += batchDeleted
      } catch (batchError) {
        logger.error(`Error in batch ${batchNumber}:`, batchError)
        throw batchError
      }

      logger.info(`Batch ${batchNumber} complete: deleted ${batchDeleted} images (${totalDeleted} total so far)`)

      if (batchDeleted === 0) {
        logger.info('No more orphaned images to delete')
      }
    } while (batchDeleted > 0 && !shouldCancel)

    logger.info(`Cleanup completed: ${totalDeleted} orphaned images deleted`)
  } catch (error) {
    logger.error('Error during orphaned images cleanup:', error)
    throw error
  } finally {
    isCleanupRunning = false
    shouldCancel = false
  }
}

export default defineEventHandler(async _event => {
  try {
    if (isCleanupRunning) {
      throw createError({
        statusCode: 409,
        message: 'Cleanup is already running'
      })
    }

    // Start cleanup in background
    cleanupOrphanedImages().catch(err => {
      logger.error('Background cleanup failed:', err)
      isCleanupRunning = false
    })

    return {
      success: true,
      message: 'Cleanup started in background'
    }
  } catch (error) {
    logger.error('Error starting cleanup:', error)
    throw error
  }
})
