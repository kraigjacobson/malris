/**
 * Media Service - Internal service for media file operations
 * This service contains the actual business logic that can be used by both API endpoints and internal functions
 */

export interface MediaFileData {
  buffer: Buffer
  filename: string
  contentType: string
  type: string
}

export async function getMediaFileData(uuid: string): Promise<MediaFileData | null> {
  try {
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
        return null
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
        console.error("Decryption error:", error)
        throw new Error("Failed to decrypt media data")
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
      
      return {
        buffer: fileData,
        filename: record.filename,
        contentType,
        type: record.type
      }
      
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error(`Failed to get media file data for ${uuid}:`, error)
    return null
  }
}