/**
 * Upload images for a subject using hybrid storage system
 * Handles multiple image uploads and associates them with a subject
 */
import { storeMedia } from '~/server/services/hybridMediaStorage'

export default defineEventHandler(async (event) => {
  try {
    const formData = await readMultipartFormData(event)
    
    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "No files provided"
      })
    }

    // Extract subject_uuid from form data
    const subjectUuidField = formData.find(field => field.name === 'subject_uuid')
    const subjectUuid = subjectUuidField?.data?.toString()

    if (!subjectUuid) {
      throw createError({
        statusCode: 400,
        statusMessage: "subject_uuid is required"
      })
    }

    const { getDb } = await import('~/server/utils/database')
    const { subjects, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()

    // Verify subject exists
    const existingSubject = await db.select()
      .from(subjects)
      .where(eq(subjects.id, subjectUuid))
      .limit(1)
    
    if (existingSubject.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Subject not found"
      })
    }

    const uploadedFiles = []
    const crypto = await import('crypto')

    // Process each uploaded file
    for (const field of formData) {
      if (field.name === 'images' && field.data && field.filename) {
        const fileData = field.data
        const filename = field.filename
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
        if (!allowedTypes.includes(field.type || '')) {
          console.warn(`Skipping file ${filename}: unsupported type ${field.type}`)
          continue
        }

        // Generate checksum
        const checksum = crypto.createHash('sha256').update(fileData).digest('hex')
        
        // Check if file already exists
        const existingFile = await db.select()
          .from(mediaRecords)
          .where(eq(mediaRecords.checksum, checksum))
          .limit(1)
        
        if (existingFile.length > 0) {
          console.warn(`File ${filename} already exists with UUID: ${existingFile[0].uuid}`)
          continue
        }

        // Store image using hybrid storage system
        const imageResult = await storeMedia(fileData, {
          filename,
          type: 'image',
          purpose: 'source',
          subjectUuid
        })

        // Update the record with subject association
        await db
          .update(mediaRecords)
          .set({
            subjectUuid,
            tagsConfirmed: false
          })
          .where(eq(mediaRecords.uuid, imageResult.uuid))

        uploadedFiles.push({
          uuid: imageResult.uuid,
          filename,
          size: fileData.length
        })
      }
    }

    if (uploadedFiles.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: "No valid image files were uploaded"
      })
    }

    return {
      success: true,
      message: `Successfully uploaded ${uploadedFiles.length} image(s)`,
      uploaded_files: uploadedFiles,
      subject_uuid: subjectUuid
    }

  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    console.error('Upload error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to upload images: ${error.message || 'Unknown error'}`
    })
  }
})