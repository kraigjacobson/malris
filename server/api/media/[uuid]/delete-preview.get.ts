/**
 * Preview what will be deleted when deleting a media record
 * Shows all related records that will be deleted
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

    const { getDb } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { eq, and } = await import('drizzle-orm')

    const db = getDb()

    // Get the media record details
    const [record] = await db
      .select({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename,
        purpose: mediaRecords.purpose,
        destMediaUuidRef: mediaRecords.destMediaUuidRef,
        type: mediaRecords.type
      })
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)

    if (!record) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media record not found'
      })
    }

    const isDestVideo = record.purpose === 'dest'
    const destMediaUuid = isDestVideo ? uuid : record.destMediaUuidRef

    const preview: {
      targetRecord: {
        uuid: string
        filename: string
        purpose: string
        type: string
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
      cascade: boolean
      totalMediaRecords?: number
      totalJobs?: number
    } = {
      targetRecord: {
        uuid: record.uuid,
        filename: record.filename,
        purpose: record.purpose || '',
        type: record.type
      },
      willDelete: {
        mediaRecords: [],
        jobs: []
      },
      cascade
    }

    if (cascade && destMediaUuid) {
      // Find jobs that reference this dest media UUID
      const { subjects } = await import('~/server/utils/schema')

      // First, always include the target media record itself
      preview.willDelete.mediaRecords.push({
        uuid: record.uuid,
        filename: record.filename,
        type: record.type,
        purpose: record.purpose || '',
        relatedTo: 'target',
        subjectName: 'This Media'
      })

      // If this media record has a thumbnail, include it
      const [mediaWithThumbnailInfo] = await db
        .select({
          thumbnailUuid: mediaRecords.thumbnailUuid
        })
        .from(mediaRecords)
        .where(eq(mediaRecords.uuid, uuid))
        .limit(1)

      if (mediaWithThumbnailInfo?.thumbnailUuid) {
        const [thumbnail] = await db
          .select({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename,
            type: mediaRecords.type,
            purpose: mediaRecords.purpose,
            subjectName: subjects.name
          })
          .from(mediaRecords)
          .leftJoin(subjects, eq(mediaRecords.subjectUuid, subjects.id))
          .where(eq(mediaRecords.uuid, mediaWithThumbnailInfo.thumbnailUuid))
          .limit(1)

        if (thumbnail) {
          preview.willDelete.mediaRecords.push({
            uuid: thumbnail.uuid,
            filename: thumbnail.filename,
            type: thumbnail.type,
            purpose: thumbnail.purpose || '',
            relatedTo: 'thumbnail',
            subjectName: 'This Media'
          })
        }
      }

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
        .where(eq(jobs.destMediaUuid, destMediaUuid))
        .orderBy(jobs.createdAt)

      for (const job of relatedJobs) {
        preview.willDelete.jobs.push({
          id: job.id,
          jobType: job.jobType,
          status: job.status,
          createdAt: job.createdAt,
          subjectName: job.subjectName || 'Unknown'
        })

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
          .where(and(eq(mediaRecords.jobId, job.id), eq(mediaRecords.purpose, 'output')))

        preview.willDelete.mediaRecords.push(
          ...jobMedia.map(m => ({
            uuid: m.uuid,
            filename: m.filename,
            type: m.type,
            purpose: m.purpose || '',
            relatedTo: job.id,
            subjectName: m.subjectName || 'Unknown'
          }))
        )
      }

      // Get sibling output records with subject info
      const siblings = await db
        .select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          purpose: mediaRecords.purpose,
          subjectName: subjects.name
        })
        .from(mediaRecords)
        .leftJoin(subjects, eq(mediaRecords.subjectUuid, subjects.id))
        .where(and(eq(mediaRecords.destMediaUuidRef, destMediaUuid), eq(mediaRecords.purpose, 'output')))

      preview.willDelete.mediaRecords.push(
        ...siblings
          .filter(m => m.uuid !== uuid)
          .map(m => ({
            uuid: m.uuid,
            filename: m.filename,
            type: m.type,
            purpose: m.purpose || '',
            relatedTo: 'sibling',
            subjectName: m.subjectName || 'Unknown'
          }))
      )

      // Get the dest media if it's different from the target
      if (!isDestVideo) {
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
          .where(and(eq(mediaRecords.uuid, destMediaUuid), eq(mediaRecords.purpose, 'dest')))
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
    } else {
      // Not cascading, just check for associated job and related media
      const { subjects } = await import('~/server/utils/schema')

      // Include the target media record itself
      preview.willDelete.mediaRecords.push({
        uuid: record.uuid,
        filename: record.filename,
        type: record.type,
        purpose: record.purpose || '',
        relatedTo: 'target',
        subjectName: 'This Media'
      })

      // If this media record has a thumbnail, include it
      const [mediaWithThumbnailInfo] = await db
        .select({
          thumbnailUuid: mediaRecords.thumbnailUuid
        })
        .from(mediaRecords)
        .where(eq(mediaRecords.uuid, uuid))
        .limit(1)

      if (mediaWithThumbnailInfo?.thumbnailUuid) {
        const [thumbnail] = await db
          .select({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename,
            type: mediaRecords.type,
            purpose: mediaRecords.purpose,
            subjectName: subjects.name
          })
          .from(mediaRecords)
          .leftJoin(subjects, eq(mediaRecords.subjectUuid, subjects.id))
          .where(eq(mediaRecords.uuid, mediaWithThumbnailInfo.thumbnailUuid))
          .limit(1)

        if (thumbnail) {
          preview.willDelete.mediaRecords.push({
            uuid: thumbnail.uuid,
            filename: thumbnail.filename,
            type: thumbnail.type,
            purpose: thumbnail.purpose || '',
            relatedTo: 'thumbnail',
            subjectName: 'This Media'
          })
        }
      }

      // Check for associated job
      const associatedJobs = await db
        .select({
          id: jobs.id,
          jobType: jobs.jobType,
          status: jobs.status,
          createdAt: jobs.createdAt,
          subjectName: subjects.name
        })
        .from(jobs)
        .leftJoin(subjects, eq(jobs.subjectUuid, subjects.id))
        .innerJoin(mediaRecords, eq(mediaRecords.jobId, jobs.id))
        .where(eq(mediaRecords.uuid, uuid))

      if (associatedJobs.length > 0) {
        const job = associatedJobs[0]
        preview.willDelete.jobs.push({
          id: job.id,
          jobType: job.jobType,
          status: job.status,
          createdAt: job.createdAt,
          subjectName: job.subjectName || 'Unknown'
        })
      }
    }

    // Add counts
    preview.totalMediaRecords = preview.willDelete.mediaRecords.length + 1
    preview.totalJobs = preview.willDelete.jobs.length

    return preview
  } catch (error: any) {
    if (error.statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media record not found'
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Preview failed: ${error instanceof Error ? error.message : String(error)}`
    })
  }
})
