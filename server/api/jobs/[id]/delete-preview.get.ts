/**
 * Preview what will be deleted when deleting a job
 * Shows all related records that will be deleted
 */
export default defineEventHandler(async event => {
  try {
    const jobId = getRouterParam(event, 'id')

    if (!jobId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Job ID is required'
      })
    }

    const { getDb } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')

    const db = getDb()

    // Get the job details with subject
    const { subjects } = await import('~/server/utils/schema')

    const [job] = await db
      .select({
        id: jobs.id,
        jobType: jobs.jobType,
        status: jobs.status,
        destMediaUuid: jobs.destMediaUuid,
        createdAt: jobs.createdAt,
        subjectUuid: jobs.subjectUuid,
        subjectName: subjects.name
      })
      .from(jobs)
      .leftJoin(subjects, eq(jobs.subjectUuid, subjects.id))
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (!job) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    const preview: {
      targetJob: {
        id: string
        jobType: string
        status: string
        createdAt: Date
        subjectName: string
      }
      willDelete: {
        mediaRecords: Array<{
          uuid: string
          filename: string
          type: string
          purpose: string
          relatedTo: string
          subjectName: string
        }>
        jobs: Array<{
          id: string
          jobType: string
          status: string
          createdAt: Date
          subjectName: string
        }>
      }
      totalMediaRecords?: number
      totalJobs?: number
    } = {
      targetJob: {
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        createdAt: job.createdAt,
        subjectName: job.subjectName || 'Unknown'
      },
      willDelete: {
        mediaRecords: [],
        jobs: []
      }
    }

    // Get output media for this job with subject info
    const jobMedia = await db
      .select({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename,
        type: mediaRecords.type,
        purpose: mediaRecords.purpose,
        subjectName: subjects.name
      })
      .from(mediaRecords)
      .leftJoin(subjects, eq(mediaRecords.subjectUuid, subjects.id))
      .where(eq(mediaRecords.jobId, jobId))

    preview.willDelete.mediaRecords.push(
      ...jobMedia.map(m => ({
        uuid: m.uuid,
        filename: m.filename,
        type: m.type,
        purpose: m.purpose || '',
        relatedTo: jobId,
        subjectName: m.subjectName || 'Unknown'
      }))
    )

    // If job has a dest_media_uuid, find all related jobs
    if (job.destMediaUuid) {
      const relatedJobs = await db
        .select({
          id: jobs.id,
          jobType: jobs.jobType,
          status: jobs.status,
          createdAt: jobs.createdAt,
          subjectName: subjects.name
        })
        .from(jobs)
        .leftJoin(subjects, eq(jobs.subjectUuid, subjects.id))
        .where(eq(jobs.destMediaUuid, job.destMediaUuid))

      // Add all related jobs except the current one
      for (const relatedJob of relatedJobs) {
        if (relatedJob.id !== jobId) {
          preview.willDelete.jobs.push({
            id: relatedJob.id,
            jobType: relatedJob.jobType,
            status: relatedJob.status,
            createdAt: relatedJob.createdAt,
            subjectName: relatedJob.subjectName || 'Unknown'
          })

          // Get output media for each related job with subject info
          const relatedJobMedia = await db
            .select({
              uuid: mediaRecords.uuid,
              filename: mediaRecords.filename,
              type: mediaRecords.type,
              purpose: mediaRecords.purpose,
              subjectName: subjects.name
            })
            .from(mediaRecords)
            .leftJoin(subjects, eq(mediaRecords.subjectUuid, subjects.id))
            .where(eq(mediaRecords.jobId, relatedJob.id))

          preview.willDelete.mediaRecords.push(
            ...relatedJobMedia.map(m => ({
              uuid: m.uuid,
              filename: m.filename,
              type: m.type,
              purpose: m.purpose || '',
              relatedTo: relatedJob.id,
              subjectName: m.subjectName || 'Unknown'
            }))
          )
        }
      }

      // Get the dest media record with subject info
      const [destMedia] = await db
        .select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          purpose: mediaRecords.purpose,
          subjectName: subjects.name
        })
        .from(mediaRecords)
        .leftJoin(subjects, eq(mediaRecords.subjectUuid, subjects.id))
        .where(eq(mediaRecords.uuid, job.destMediaUuid))
        .limit(1)

      if (destMedia) {
        preview.willDelete.mediaRecords.push({
          uuid: destMedia.uuid,
          filename: destMedia.filename,
          type: destMedia.type,
          purpose: destMedia.purpose || '',
          relatedTo: 'dest',
          subjectName: destMedia.subjectName || 'Unknown'
        })
      }
    }

    // Add counts (include the target job in the count)
    preview.totalMediaRecords = preview.willDelete.mediaRecords.length
    preview.totalJobs = preview.willDelete.jobs.length + 1

    return preview
  } catch (error: any) {
    if (error.statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Preview failed: ${error instanceof Error ? error.message : String(error)}`
    })
  }
})
