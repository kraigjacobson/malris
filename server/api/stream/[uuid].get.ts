import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'
import { pbkdf2Sync, createDecipheriv, createHmac, timingSafeEqual } from 'crypto'

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
    const uuid = getRouterParam(event, 'uuid')
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'UUID parameter is required'
      })
    }

    // Get media record from database
    const db = getDb()
    const mediaRecord = await db
      .select()
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)

    if (!mediaRecord.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media not found'
      })
    }

    const record = mediaRecord[0]

    // Validate that this is a video file
    if (record.type !== 'video') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Only video files can be streamed'
      })
    }

    // Check if encrypted data exists
    if (!record.encryptedData) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media record has no encrypted data'
      })
    }

    // Get encryption key from environment
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
    if (!encryptionKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media encryption not configured'
      })
    }

    // Initialize decryptor
    const decryptor = new FernetDecryptor(encryptionKey)

    // Decrypt the data
    let decryptedData: Buffer
    try {
      // Handle both string and Buffer types for encrypted data
      let hexData: string
      if (Buffer.isBuffer(record.encryptedData)) {
        // If it's a Buffer, convert to hex string
        hexData = record.encryptedData.toString('hex')
      } else if (typeof record.encryptedData === 'string') {
        // If it's a string, remove \x prefix if present
        hexData = record.encryptedData.startsWith('\\x') ? record.encryptedData.slice(2) : record.encryptedData
      } else {
        throw new Error(`Unexpected encryptedData type: ${typeof record.encryptedData}`)
      }
      
      const base64urlString = Buffer.from(hexData, 'hex').toString('utf8')
      
      // Decode base64url to get the actual Fernet token
      const fernetToken = Buffer.from(base64urlString.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      
      decryptedData = decryptor.decrypt(fernetToken)
    } catch (error) {
      console.error('Decryption error:', error)
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
      .where(eq(mediaRecords.uuid, uuid))

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

    // Handle range requests for video streaming
    const range = getHeader(event, 'range')
    const fileSize = decryptedData.length

    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-')
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
      setHeader(event, 'Content-Range', `bytes ${start}-${end}/${fileSize}`)
      setHeader(event, 'Accept-Ranges', 'bytes')
      setHeader(event, 'Content-Length', chunkSize)
      setHeader(event, 'Content-Type', contentType)

      // Return the requested chunk
      return decryptedData.subarray(start, end + 1)
    } else {
      // Return full file
      setHeader(event, 'Content-Length', fileSize)
      setHeader(event, 'Content-Type', contentType)
      setHeader(event, 'Accept-Ranges', 'bytes')

      return decryptedData
    }

  } catch (error) {
    console.error('Stream error:', error)
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})