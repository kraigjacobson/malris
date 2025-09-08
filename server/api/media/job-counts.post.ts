import { getDb } from '~/server/utils/database'
import { jobs } from '~/server/utils/schema'
import { inArray, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { image_uuids } = body

    if (!image_uuids || !Array.isArray(image_uuids) || image_uuids.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'image_uuids array is required'
      })
    }

    const db = getDb()

    // Count jobs for each image UUID where the image is used as source media
    const jobCounts = await db
      .select({
        image_uuid: jobs.sourceMediaUuid,
        job_count: sql<number>`COUNT(*)::int`
      })
      .from(jobs)
      .where(inArray(jobs.sourceMediaUuid, image_uuids))
      .groupBy(jobs.sourceMediaUuid)

    // Create a map with all requested UUIDs, defaulting to 0 for images with no jobs
    const countsMap: Record<string, number> = {}
    image_uuids.forEach(uuid => {
      countsMap[uuid] = 0
    })

    // Update with actual counts
    jobCounts.forEach(result => {
      if (result.image_uuid) {
        countsMap[result.image_uuid] = result.job_count
      }
    })

    return {
      success: true,
      job_counts: countsMap
    }

  } catch (error: any) {
    console.error('Error fetching job counts:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch job counts: ${error.message || 'Unknown error'}`
    })
  }
})