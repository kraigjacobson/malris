import { logger } from '~/server/utils/logger'
export default defineEventHandler(async event => {
  try {
    // Get the job ID from the route parameters
    const jobId = getRouterParam(event, 'id')
    const query = getQuery(event)
    const cascade = query.cascade !== 'false'

    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required'
      })
    }

    logger.info(`🗑️ Deleting job ${jobId} with cascade: ${cascade}...`)

    // Use Drizzle ORM and raw SQL for cascade deletion
    const { getDb, getDbClient } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')

    const db = getDb()
    const client = await getDbClient()
    let deleted: any

    try {
      // First check if job exists and get its dest_media_uuid
      const existingJob = await db
        .select({
          id: jobs.id,
          jobType: jobs.jobType,
          status: jobs.status,
          destMediaUuid: jobs.destMediaUuid,
          outputUuid: jobs.outputUuid
        })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1)

      if (existingJob.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Job not found'
        })
      }

      const job = existingJob[0]
      const destMediaUuid = job.destMediaUuid
      let deletedCount = 0
      let deletedJobs = 0

      // Delete this job's output media first
      const deletedOutputMedia = await db.delete(mediaRecords).where(eq(mediaRecords.jobId, jobId)).returning()
      deletedCount += deletedOutputMedia.length
      logger.info(`🗑️ Deleted ${deletedOutputMedia.length} output media for job ${jobId}`)

      // If job has a dest_media_uuid and cascade is enabled, cascade delete all related records
      if (cascade && destMediaUuid) {
        logger.info(`🗑️ Cascading delete for dest video ${destMediaUuid}`)

        // Find all jobs that use the same dest video
        const relatedJobs = await db
          .select({
            id: jobs.id
          })
          .from(jobs)
          .where(eq(jobs.destMediaUuid, destMediaUuid))

        logger.info(`🗑️ Found ${relatedJobs.length} jobs using dest video ${destMediaUuid}`)

        // Delete output media for all related jobs
        for (const relatedJob of relatedJobs) {
          if (relatedJob.id !== jobId) {
            // Skip the current job as we already deleted its media
            const deletedRelatedMedia = await db.delete(mediaRecords).where(eq(mediaRecords.jobId, relatedJob.id)).returning()
            deletedCount += deletedRelatedMedia.length
            logger.info(`🗑️ Deleted ${deletedRelatedMedia.length} output media for related job ${relatedJob.id}`)
          }
        }

        // Delete all related jobs (but not the original job yet)
        for (const relatedJob of relatedJobs) {
          if (relatedJob.id !== jobId) {
            await db.delete(jobs).where(eq(jobs.id, relatedJob.id))
            deletedJobs++
            logger.info(`🗑️ Deleted related job ${relatedJob.id}`)
          }
        }

        // Delete the original job BEFORE deleting the dest media (to avoid foreign key constraint violation)
        const deletedJob = await db.delete(jobs).where(eq(jobs.id, jobId)).returning({
          id: jobs.id,
          jobType: jobs.jobType,
          status: jobs.status
        })
        deleted = deletedJob[0]
        deletedJobs++ // Count the original job
        logger.info(`🗑️ Deleted original job ${jobId}`)

        // Now delete the dest media record (all jobs that referenced it are gone)
        const deletedDestMedia = await db.delete(mediaRecords).where(eq(mediaRecords.uuid, destMediaUuid)).returning()
        deletedCount += deletedDestMedia.length
        logger.info(`🗑️ Deleted dest media ${destMediaUuid}`)

        logger.info(`✅ Successfully deleted ${deletedJobs} jobs and ${deletedCount} media records`)
      } else {
        // No dest media, just delete the job
        const deletedJob = await db.delete(jobs).where(eq(jobs.id, jobId)).returning({
          id: jobs.id,
          jobType: jobs.jobType,
          status: jobs.status
        })
        deleted = deletedJob[0]
        deletedJobs++
        logger.info(`✅ Successfully deleted job ${jobId}`)
      }
    } finally {
      client.release()
    }

    // Update job counts for WebSocket clients
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('Failed to update job counts after job deletion:', error)
    }

    return {
      success: true,
      message: `Job ${jobId} deleted successfully`,
      data: {
        deleted_job_id: deleted.id,
        job_type: deleted.jobType,
        status: deleted.status
      }
    }
  } catch (error: any) {
    logger.error('❌ Failed to delete job:', error)
    logger.error('❌ Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?._data
    })

    // Handle different types of errors
    if (error.response?.status === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    if (error.response?.status === 400) {
      throw createError({
        statusCode: 400,
        statusMessage: error.response._data?.detail || 'Bad request'
      })
    }

    // Generic error handling
    throw createError({
      statusCode: error.response?.status || 500,
      statusMessage: error.response?._data?.detail || error.message || 'Failed to delete job'
    })
  }
})
