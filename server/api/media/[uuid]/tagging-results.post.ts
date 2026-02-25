import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { onTaggingComplete } from '~/server/api/media/tag-all-untagged.post'
import { logger } from '~/server/utils/logger'
import { filterAndNormalizeTags } from '~/server/utils/tagConfig'

export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    const body = await readBody(event)

    logger.info(`🔥 [TAGGING-RESULTS] ===== INCOMING REQUEST =====`)
    logger.info(`🔥 [TAGGING-RESULTS] Media UUID: ${uuid}`)
    logger.info(`🔥 [TAGGING-RESULTS] Raw tags from WD14: ${body.tag_results}`)

    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Media UUID is required'
      })
    }

    if (!body.tag_results) {
      throw createError({
        statusCode: 400,
        statusMessage: 'tag_results is required'
      })
    }

    const db = getDb()

    // Filter and normalize tags using our allowed tags configuration
    // This converts WD14/Danbooru tags to our simplified vocabulary and removes unrecognized tags
    const filteredTags = filterAndNormalizeTags(body.tag_results)

    logger.info(`🔥 [TAGGING-RESULTS] Filtered tags (${filteredTags.length}): ${filteredTags.join(', ')}`)

    const tagsObject = {
      tags: filteredTags,
      rawTags: body.tag_results, // Keep original for debugging/reference
      model: 'wd14-tagger',
      confidence: 0.35,
      timestamp: new Date().toISOString(),
      source: 'comfyui-auto-tagging'
    }
    
    // Update the media record with the tags
    const result = await db
      .update(mediaRecords)
      .set({
        tags: tagsObject,
        updatedAt: new Date()
      })
      .where(eq(mediaRecords.uuid, uuid))
      .returning({ uuid: mediaRecords.uuid })
    
    if (result.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media record not found'
      })
    }

    logger.info(`🔥 [TAGGING-RESULTS] ✅ Updated ${uuid} with ${filteredTags.length} tags: [${filteredTags.join(', ')}]`)

    const response = {
      success: true,
      message: 'Tags updated successfully',
      uuid: uuid,
      tags: tagsObject,
      filteredCount: filteredTags.length
    }
    
    // Notify the queue system that tagging is complete so it can process the next video
    onTaggingComplete()
    
    return response
    
  } catch (error: any) {
    logger.error('❌ Error updating media tags:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to update media tags'
    })
  }
})