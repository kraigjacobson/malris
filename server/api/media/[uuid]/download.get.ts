import { logger } from '~/server/utils/logger'
/**
 * Download and decrypt a media file with optional resizing
 * Replaces the FastAPI /media/{record_uuid}/download route
 */
export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    const query = getQuery(event)
    const size = (query.size as string) || 'sm' // thumb, sm, md, lg
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: "UUID parameter is required"
      })
    }
    
    // Validate size parameter
    if (!['thumb', 'sm', 'md', 'lg'].includes(size)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Size must be 'thumb', 'sm', 'md', or 'lg'"
      })
    }
    
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      // Get media record with encrypted data
      const queryText = `
        SELECT 
          uuid,
          filename,
          type,
          encrypted_data,
          width,
          height
        FROM media_records 
        WHERE uuid = $1
      `
      
      const result = await client.query(queryText, [uuid])
      
      if (result.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Media record not found"
        })
      }
      
      const record = result.rows[0]
      
      // Update access tracking
      await client.query(
        'UPDATE media_records SET last_accessed = NOW(), access_count = access_count + 1 WHERE uuid = $1',
        [uuid]
      )
      
      // Decrypt the file data using proper Fernet decryption
      let fileData: Buffer
      try {
        const { decryptMediaData } = await import('~/server/utils/encryption')
        const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY || 'default_key'
        fileData = decryptMediaData(record.encrypted_data, encryptionKey)
      } catch (error: any) {
        logger.error("Decryption error:", error)
        throw createError({
          statusCode: 500,
          statusMessage: "Failed to decrypt media data"
        })
      }
      
      // Determine content type
      const filename = record.filename.toLowerCase()
      let contentType = "application/octet-stream"
      
      if (record.type === "image") {
        if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
          contentType = "image/jpeg"
        } else if (filename.endsWith('.png')) {
          contentType = "image/png"
        } else if (filename.endsWith('.webp')) {
          contentType = "image/webp"
        } else if (filename.endsWith('.gif')) {
          contentType = "image/gif"
        } else {
          contentType = "image/jpeg" // Default for images
        }
      } else if (record.type === "video") {
        if (filename.endsWith('.mp4')) {
          contentType = "video/mp4"
        } else if (filename.endsWith('.avi')) {
          contentType = "video/x-msvideo"
        } else if (filename.endsWith('.mov')) {
          contentType = "video/quicktime"
        } else if (filename.endsWith('.webm')) {
          contentType = "video/webm"
        } else {
          contentType = "video/mp4" // Default for videos
        }
      }
      
      // TODO: Implement image resizing for different sizes
      // For now, return the original file data
      
      // Modify filename for non-original sizes
      let outputFilename = record.filename
      if (size !== "lg") {
        const ext = outputFilename.substring(outputFilename.lastIndexOf('.'))
        const name = outputFilename.substring(0, outputFilename.lastIndexOf('.'))
        outputFilename = `${name}_${size}${ext}`
      }
      
      // Set response headers
      setHeader(event, 'Content-Type', contentType)
      setHeader(event, 'Content-Disposition', `attachment; filename="${outputFilename}"`)
      setHeader(event, 'Content-Length', fileData.length)
      
      return fileData
      
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Download failed: ${error.message || 'Unknown error'}`
    })
  }
})