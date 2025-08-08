import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    const body = await readBody(event)
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'UUID is required'
      })
    }

    const { tags, tags_confirmed = true } = body

    if (!Array.isArray(tags)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Tags must be an array'
      })
    }

    const db = getDb()

    // Check if media record exists
    const existingRecord = await db
      .select({ uuid: mediaRecords.uuid })
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)

    if (!existingRecord || existingRecord.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media record not found'
      })
    }

    // Update the tags and tags_confirmed status
    const updatedRecord = await db
      .update(mediaRecords)
      .set({
        tags: { tags }, // Store as JSONB object with tags array
        tagsConfirmed: tags_confirmed,
        updatedAt: new Date()
      })
      .where(eq(mediaRecords.uuid, uuid))
      .returning({
        uuid: mediaRecords.uuid,
        tags: mediaRecords.tags,
        tagsConfirmed: mediaRecords.tagsConfirmed,
        updatedAt: mediaRecords.updatedAt
      })

    if (!updatedRecord || updatedRecord.length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to update media record'
      })
    }

    return {
      success: true,
      message: 'Tags updated successfully',
      data: updatedRecord[0]
    }

  } catch (error: any) {
    logger.error('Error updating media tags:', error)
    
    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update tags: ${error.message || 'Unknown error'}`
    })
  }
})