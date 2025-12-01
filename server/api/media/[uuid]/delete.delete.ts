/**
 * Delete a media record
 * Replaces the FastAPI /media/{record_uuid} DELETE route
 */
export default defineEventHandler(async event => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    const query = getQuery(event)
    const cascade = query.cascade === 'true' || query.cascade === true

    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'UUID parameter is required'
      })
    }

    // Delete media record from database
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()

    try {
      // First check if the record exists and get its purpose and dest_media_uuid_ref
      const checkQuery = 'SELECT uuid, purpose, dest_media_uuid_ref FROM media_records WHERE uuid = $1'
      const checkResult = await client.query(checkQuery, [uuid])

      if (checkResult.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Media record not found'
        })
      }

      const record = checkResult.rows[0]
      const isDestVideo = record.purpose === 'dest'
      // If deleting a dest video, use its own UUID; otherwise use the dest_media_uuid_ref
      const destMediaUuid = isDestVideo ? uuid : record.dest_media_uuid_ref
      let deletedCount = 0
      let deletedJobs = 0

      // If cascade is enabled and we have a dest video to cascade from
      if (cascade && destMediaUuid) {
        // Find jobs that reference this dest media UUID
        const findJobsQuery = 'SELECT id FROM jobs WHERE dest_media_uuid = $1'
        const jobsResult = await client.query(findJobsQuery, [destMediaUuid])

        // For each job, delete output media records associated with it (not source/subject), then delete the job
        for (const job of jobsResult.rows) {
          const jobId = job.id

          // Delete only output media records associated with this job (videos and images)
          // Do NOT delete source or subject media
          const deleteJobMediaQuery = "DELETE FROM media_records WHERE job_id = $1 AND purpose = 'output'"
          const jobMediaResult = await client.query(deleteJobMediaQuery, [jobId])
          deletedCount += jobMediaResult.rowCount || 0

          // Delete the job itself
          const deleteJobQuery = 'DELETE FROM jobs WHERE id = $1'
          await client.query(deleteJobQuery, [jobId])
          deletedJobs++
        }

        // Delete all output records that share the same dest_media_uuid_ref (siblings)
        // This catches any orphaned output records
        const deleteSiblingsQuery = "DELETE FROM media_records WHERE dest_media_uuid_ref = $1 AND purpose = 'output' AND uuid != $2"
        const siblingsResult = await client.query(deleteSiblingsQuery, [destMediaUuid, uuid])
        deletedCount += siblingsResult.rowCount || 0

        // Delete the dest media record itself
        const deleteDestQuery = "DELETE FROM media_records WHERE uuid = $1 AND purpose = 'dest'"
        const destResult = await client.query(deleteDestQuery, [destMediaUuid])
        deletedCount += destResult.rowCount || 0
      }

      // If not cascading, just delete the job associated with this record
      if (!cascade) {
        const jobQuery = 'SELECT job_id FROM media_records WHERE uuid = $1'
        const jobResult = await client.query(jobQuery, [uuid])
        if (jobResult.rows.length > 0 && jobResult.rows[0].job_id) {
          const deleteJobQuery = 'DELETE FROM jobs WHERE id = $1'
          await client.query(deleteJobQuery, [jobResult.rows[0].job_id])
          deletedJobs = 1
        }
      }

      // Delete the original record
      const deleteQuery = 'DELETE FROM media_records WHERE uuid = $1'
      await client.query(deleteQuery, [uuid])
      deletedCount += 1

      return {
        message: cascade && destMediaUuid ? `Media record deleted successfully along with ${deletedCount - 1} related media records and ${deletedJobs} jobs` : deletedJobs > 0 ? `Media record and associated job deleted successfully` : 'Media record deleted successfully',
        uuid,
        deletedCount,
        deletedJobs,
        cascadeDeleted: cascade && destMediaUuid ? true : false
      }
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media record not found'
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Delete failed: ${error instanceof Error ? error.message : String(error)}`
    })
  }
})
