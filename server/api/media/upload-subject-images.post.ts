/**
 * Upload images for a subject using hybrid storage system
 * Handles multiple image uploads and associates them with a subject
 */
import sharp from 'sharp'
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

        // Plaintext SHA256 — used both to fast-path dedup and to populate the
        // UNIQUE content_sha256 column so concurrent uploads can't slip dups in.
        const contentSha256 = crypto.createHash('sha256').update(fileData).digest()

        const existingFile = await db.select({ uuid: mediaRecords.uuid })
          .from(mediaRecords)
          .where(eq(mediaRecords.contentSha256, contentSha256))
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
          subjectUuid,
          contentSha256
        })

        if (imageResult.wasDuplicate) {
          // Race: another concurrent upload won the INSERT. Skip the metadata
          // update — the existing row is authoritative.
          console.warn(`File ${filename} deduped on race; existing UUID: ${imageResult.uuid}`)
          continue
        }

        // Read dimensions from the raw (un-resized) bytes so the grid can
        // reserve the correct aspect-ratio box before the image loads.
        // metadata() only reads headers so this is cheap even for big files.
        let width: number | null = null
        let height: number | null = null
        try {
          const meta = await sharp(fileData).metadata()
          width = meta.width ?? null
          height = meta.height ?? null
        } catch (err) {
          console.warn(`Could not read dimensions for ${filename}:`, (err as Error)?.message)
        }

        // Update the record with subject association and dimensions
        await db
          .update(mediaRecords)
          .set({
            subjectUuid,
            tagsConfirmed: false,
            width,
            height
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