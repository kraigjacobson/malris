import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, sql, and } from 'drizzle-orm'
import { pbkdf2Sync, createDecipheriv, createHmac, timingSafeEqual } from 'crypto'
import { logger } from '~/server/utils/logger'
import { getQuery, getHeader, setHeader, setResponseStatus, createError } from 'h3'

// Manual Fernet implementation for binary data
class FernetDecryptor {
  private signingKey: Buffer
  private encryptionKey: Buffer

  constructor(password: string) {
    // Match Python's encryption setup exactly
    const salt = Buffer.from('comfy_media_salt_v1', 'utf8')
    const iterations = 100000
    
    // Generate key using PBKDF2 (same as Python)
    const derivedKey = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
    
    // Fernet uses the first 16 bytes for signing, last 16 bytes for encryption
    this.signingKey = derivedKey.subarray(0, 16)
    this.encryptionKey = derivedKey.subarray(16, 32)
  }

  decrypt(encryptedData: Buffer): Buffer {
    try {
      // Fernet token structure:
      // Version (1 byte) | Timestamp (8 bytes) | IV (16 bytes) | Ciphertext (variable) | HMAC (32 bytes)
      
      if (encryptedData.length < 57) { // 1 + 8 + 16 + 0 + 32
        throw new Error('Token too short')
      }
      
      // Parse token components
      const version = encryptedData[0]
      const _timestamp = encryptedData.subarray(1, 9)
      const iv = encryptedData.subarray(9, 25)
      const ciphertext = encryptedData.subarray(25, -32)
      const hmac = encryptedData.subarray(-32)
      
      // Verify version
      if (version !== 0x80) {
        throw new Error(`Invalid Fernet version: ${version}`)
      }
      
      // Verify HMAC
      const dataToSign = encryptedData.subarray(0, -32)
      const expectedHmac = createHmac('sha256', this.signingKey).update(dataToSign).digest()
      
      if (!timingSafeEqual(hmac, expectedHmac)) {
        throw new Error('HMAC verification failed')
      }
      
      // Decrypt using AES-128-CBC
      const decipher = createDecipheriv('aes-128-cbc', this.encryptionKey, iv)
      decipher.setAutoPadding(true)
      
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ])
      
      return decrypted
      
    } catch (error) {
      throw new Error(`Fernet decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

export default defineEventHandler(async (event) => {
  try {
    // Get query parameters
    const query = getQuery(event)
    const subjectUuid = query.subject_uuid as string
    const purpose = query.purpose as string || 'dest'
    // const tags = query.tags as string // TODO: Implement tag filtering
    
    // Get range header from the request
    const rangeHeader = getHeader(event, 'range')

    // Get encryption key from environment
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
    if (!encryptionKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media encryption not configured'
      })
    }

    // Build database query for random video
    const db = getDb()
    
    // Build where conditions
    const conditions = [eq(mediaRecords.type, 'video')]
    
    if (subjectUuid) {
      conditions.push(eq(mediaRecords.subjectUuid, subjectUuid))
    }
    
    if (purpose) {
      conditions.push(eq(mediaRecords.purpose, purpose))
    }

    // Execute query with all conditions
    const randomRecord = await db
      .select()
      .from(mediaRecords)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(sql`RANDOM()`)
      .limit(1)

    if (!randomRecord.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No videos found matching criteria'
      })
    }

    const record = randomRecord[0]

    // Check if encrypted data exists
    if (!record.encryptedData) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media record has no encrypted data'
      })
    }

    // Initialize decryptor
    const decryptor = new FernetDecryptor(encryptionKey)

    // Decrypt the data
    let decryptedData: Buffer
    try {
      // encryptedData is always a Buffer from the database (bytea type)
      if (!Buffer.isBuffer(record.encryptedData)) {
        throw new Error(`Expected Buffer for encryptedData, got: ${typeof record.encryptedData}`)
      }
      
      // Convert buffer to hex string, then to utf8 to get base64url string
      const hexData = record.encryptedData.toString('hex')
      const base64urlString = Buffer.from(hexData, 'hex').toString('utf8')
      
      // Decode base64url to get the actual Fernet token
      const fernetToken = Buffer.from(base64urlString.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      
      decryptedData = decryptor.decrypt(fernetToken)
    } catch (error) {
      logger.error('Decryption error:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to decrypt media data'
      })
    }

    // Update access tracking
    await db
      .update(mediaRecords)
      .set({
        accessCount: (record.accessCount || 0) + 1,
        lastAccessed: new Date()
      })
      .where(eq(mediaRecords.uuid, record.uuid))

    // Determine content type
    let contentType = 'video/mp4' // Default
    if (record.filename) {
      const ext = record.filename.toLowerCase().split('.').pop()
      switch (ext) {
        case 'mp4':
          contentType = 'video/mp4'
          break
        case 'webm':
          contentType = 'video/webm'
          break
        case 'avi':
          contentType = 'video/x-msvideo'
          break
        case 'mov':
          contentType = 'video/quicktime'
          break
        case 'mkv':
          contentType = 'video/x-matroska'
          break
        default:
          contentType = 'video/mp4'
      }
    }

    // Set response headers with mobile-friendly settings
    setHeader(event, 'content-type', contentType)
    setHeader(event, 'cache-control', 'public, max-age=3600')
    setHeader(event, 'access-control-allow-origin', '*')
    setHeader(event, 'access-control-allow-methods', 'GET')
    setHeader(event, 'access-control-allow-headers', 'Range')
    setHeader(event, 'x-content-type-options', 'nosniff')
    setHeader(event, 'vary', 'Accept-Encoding')
    setHeader(event, 'x-video-uuid', record.uuid)
    setHeader(event, 'accept-ranges', 'bytes')

    // Handle range requests for video streaming
    const fileSize = decryptedData.length

    if (rangeHeader) {
      // Parse range header
      const parts = rangeHeader.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = (end - start) + 1

      // Validate range
      if (start >= fileSize || end >= fileSize) {
        setResponseStatus(event, 416) // Range Not Satisfiable
        setHeader(event, 'Content-Range', `bytes */${fileSize}`)
        return 'Range Not Satisfiable'
      }

      // Set partial content headers
      setResponseStatus(event, 206) // Partial Content
      setHeader(event, 'content-range', `bytes ${start}-${end}/${fileSize}`)
      setHeader(event, 'content-length', chunkSize)

      // Return the requested chunk
      return decryptedData.subarray(start, end + 1)
    } else {
      // Return full file
      setHeader(event, 'content-length', fileSize)
      return decryptedData
    }

  } catch (error) {
    logger.error('Error streaming random video:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to stream random video: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})