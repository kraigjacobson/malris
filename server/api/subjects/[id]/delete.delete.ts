/**
 * Delete a subject and all associated data
 * Cascade deletes:
 * - All media records associated with the subject
 * - All jobs associated with the subject
 */
export default defineEventHandler(async event => {
  try {
    const id = getRouterParam(event, 'id')

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Subject ID parameter is required'
      })
    }

    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()

    try {
      // First check if the subject exists
      const checkQuery = 'SELECT id, name FROM subjects WHERE id = $1'
      const checkResult = await client.query(checkQuery, [id])

      if (checkResult.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Subject not found'
        })
      }

      const subjectName = checkResult.rows[0].name
      let deletedMediaCount = 0
      let deletedJobsCount = 0

      // Delete all media records associated with this subject, EXCEPT destination videos
      const deleteMediaQuery = "DELETE FROM media_records WHERE subject_uuid = $1 AND purpose != 'dest'"
      const mediaResult = await client.query(deleteMediaQuery, [id])
      deletedMediaCount = mediaResult.rowCount || 0

      // Delete all jobs associated with this subject
      const deleteJobsQuery = 'DELETE FROM jobs WHERE subject_uuid = $1'
      const jobsResult = await client.query(deleteJobsQuery, [id])
      deletedJobsCount = jobsResult.rowCount || 0

      // Delete the subject itself
      const deleteSubjectQuery = 'DELETE FROM subjects WHERE id = $1'
      await client.query(deleteSubjectQuery, [id])

      return {
        success: true,
        message: `Subject "${subjectName}" deleted successfully`,
        id,
        deletedMediaCount,
        deletedJobsCount
      }
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Subject not found'
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Delete failed: ${error instanceof Error ? error.message : String(error)}`
    })
  }
})
