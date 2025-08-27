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

    const { purpose } = body

    if (!purpose || typeof purpose !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Purpose must be a valid string'
      })
    }

    // Validate purpose value
    const validPurposes = ['source', 'dest', 'intermediate', 'backup', 'output', 'thumbnail', 'voyeur', 'subject', 'porn', 'todo']
    if (!validPurposes.includes(purpose)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid purpose. Must be one of: ${validPurposes.join(', ')}`
      })
    }

    const db = getDb()

    // Check if media record exists
    const existingRecord = await db
      .select({ uuid: mediaRecords.uuid, purpose: mediaRecords.purpose })
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)

    if (!existingRecord || existingRecord.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media record not found'
      })
    }

    // Update the purpose
    const updatedRecord = await db
      .update(mediaRecords)
      .set({
        purpose: purpose,
        updatedAt: new Date()
      })
      .where(eq(mediaRecords.uuid, uuid))
      .returning({
        uuid: mediaRecords.uuid,
        purpose: mediaRecords.purpose,
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
      message: 'Purpose updated successfully',
      data: updatedRecord[0]
    }

  } catch (error: any) {
    logger.error('Error updating media purpose:', error)
    
    // If it's already an HTTP error, re-throw it
    if (error.statusCode) {
      throw error
    }

    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update purpose: ${error.message || 'Unknown error'}`
    })
  }
})