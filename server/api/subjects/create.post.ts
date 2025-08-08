/**
 * Create a new subject using Drizzle ORM
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { name, tags, note, thumbnail } = body
    
    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: "Name is required"
      })
    }
    
    const { getDb } = await import('~/server/utils/database')
    const { subjects, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()
    
    // Parse tags
    let tagList: string[] = []
    if (tags) {
      if (typeof tags === 'string') {
        tagList = tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      } else if (Array.isArray(tags)) {
        tagList = tags
      }
    }
    
    // Check if name already exists
    const existingSubject = await db.select().from(subjects).where(eq(subjects.name, name)).limit(1)
    
    if (existingSubject.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: "Subject with this name already exists"
      })
    }
    
    // Verify thumbnail image exists if provided
    if (thumbnail) {
      const existingImage = await db.select()
        .from(mediaRecords)
        .where(eq(mediaRecords.uuid, thumbnail))
        .limit(1)
      
      if (existingImage.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Thumbnail image not found"
        })
      }
    }
    
    // Create subject using Drizzle - explicitly generate UUID since database doesn't have default
    const tagsJson = tagList.length > 0 ? { tags: tagList } : null
    const crypto = await import('crypto')
    const subjectId = crypto.randomUUID()
    
    const newSubject = await db.insert(subjects).values({
      id: subjectId,
      name: name.trim(),
      tags: tagsJson,
      note: note?.trim() || null,
      thumbnail: thumbnail || null
    }).returning({
      id: subjects.id,
      name: subjects.name,
      createdAt: subjects.createdAt
    })
    
    if (newSubject.length === 0) {
      throw createError({
        statusCode: 500,
        statusMessage: "Failed to create subject"
      })
    }
    
    return {
      id: newSubject[0].id,
      name: newSubject[0].name,
      message: "Subject created successfully",
      created_at: newSubject[0].createdAt
    }
    
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    console.error('Subject creation error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create subject: ${error.message || 'Unknown error'}`
    })
  }
})