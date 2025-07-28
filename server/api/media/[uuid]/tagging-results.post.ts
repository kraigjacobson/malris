import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { onTaggingComplete } from '~/server/api/media/tag-all-untagged.post'

export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    const body = await readBody(event)
    
    console.log(`🔥 [TAGGING-RESULTS] ===== INCOMING REQUEST =====`)
    console.log(`🔥 [TAGGING-RESULTS] Media UUID: ${uuid}`)
    console.log(`🔥 [TAGGING-RESULTS] Request method: ${event.node.req.method}`)
    console.log(`🔥 [TAGGING-RESULTS] Request URL: ${event.node.req.url}`)
    console.log(`🔥 [TAGGING-RESULTS] Request headers:`, JSON.stringify(event.node.req.headers, null, 2))
    console.log(`🔥 [TAGGING-RESULTS] Request body:`, JSON.stringify(body, null, 2))
    console.log(`🔥 [TAGGING-RESULTS] Tags: ${body.tag_results}`)
    
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
    
    // Parse the tags and create a proper tags object
    const tagsList = body.tag_results.split(', ').map((tag: string) => tag.trim())
    const tagsObject = {
      tags: tagsList,
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
    
    console.log(`🔥 [TAGGING-RESULTS] Database update result:`, JSON.stringify(result, null, 2))
    console.log(`🔥 [TAGGING-RESULTS] ✅ Successfully updated tags for media UUID: ${uuid}`)
    console.log(`🔥 [TAGGING-RESULTS] Final tags object:`, JSON.stringify(tagsObject, null, 2))
    
    const response = {
      success: true,
      message: 'Tags updated successfully',
      uuid: uuid,
      tags: tagsObject
    }
    
    console.log(`🔥 [TAGGING-RESULTS] Sending response:`, JSON.stringify(response, null, 2))
    console.log(`🔥 [TAGGING-RESULTS] ===== REQUEST COMPLETED =====`)
    
    // Notify the queue system that tagging is complete so it can process the next video
    onTaggingComplete()
    
    return response
    
  } catch (error: any) {
    console.error('❌ Error updating media tags:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to update media tags'
    })
  }
})