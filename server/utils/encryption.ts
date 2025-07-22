import { pbkdf2Sync, createDecipheriv, createCipheriv, createHmac, timingSafeEqual, randomBytes } from 'crypto'

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

// Manual Fernet implementation for encryption
class FernetEncryptor {
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

  encrypt(data: Buffer): Buffer {
    try {
      // Generate random IV (16 bytes for AES-128-CBC)
      const iv = randomBytes(16)
      
      // Current timestamp (8 bytes)
      const timestamp = Buffer.alloc(8)
      timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)), 0)
      
      // Encrypt using AES-128-CBC
      const cipher = createCipheriv('aes-128-cbc', this.encryptionKey, iv)
      cipher.setAutoPadding(true)
      
      const ciphertext = Buffer.concat([
        cipher.update(data),
        cipher.final()
      ])
      
      // Build Fernet token: Version (1 byte) | Timestamp (8 bytes) | IV (16 bytes) | Ciphertext (variable)
      const version = Buffer.from([0x80])
      const tokenWithoutHmac = Buffer.concat([version, timestamp, iv, ciphertext])
      
      // Calculate HMAC
      const hmac = createHmac('sha256', this.signingKey).update(tokenWithoutHmac).digest()
      
      // Final token: tokenWithoutHmac + HMAC (32 bytes)
      const fernetToken = Buffer.concat([tokenWithoutHmac, hmac])
      
      return fernetToken
      
    } catch (error) {
      throw new Error(`Fernet encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

/**
 * Encrypt media data using Fernet encryption
 */
export function encryptMediaData(data: Buffer, encryptionKey: string): Buffer {
  const encryptor = new FernetEncryptor(encryptionKey)
  
  // Encrypt the data and return the raw Fernet token
  // This will be stored directly as bytea in PostgreSQL
  const fernetToken = encryptor.encrypt(data)
  
  return fernetToken
}

/**
 * Decrypt media data using Fernet encryption
 */
export function decryptMediaData(encryptedData: string | Buffer, encryptionKey: string): Buffer {
  const decryptor = new FernetDecryptor(encryptionKey)

  // Handle both string and Buffer types for encrypted data
  let fernetToken: Buffer
  
  if (Buffer.isBuffer(encryptedData)) {
    // Check if it's a raw Fernet token (starts with 0x80) or legacy hex-encoded data
    if (encryptedData[0] === 0x80) {
      // This is a raw Fernet token (new format)
      fernetToken = encryptedData
    } else {
      // This is legacy hex-encoded data stored as Buffer
      const hexData = encryptedData.toString('hex')
      const base64urlString = Buffer.from(hexData, 'hex').toString('utf8')
      fernetToken = Buffer.from(base64urlString.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    }
  } else if (typeof encryptedData === 'string') {
    // Legacy format: hex-encoded string
    let hexData: string
    if (encryptedData.startsWith('\\x')) {
      // PostgreSQL bytea text format
      hexData = encryptedData.slice(2)
    } else {
      // Assume it's already hex
      hexData = encryptedData
    }
    
    const base64urlString = Buffer.from(hexData, 'hex').toString('utf8')
    fernetToken = Buffer.from(base64urlString.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  } else {
    throw new Error(`Unexpected encryptedData type: ${typeof encryptedData}`)
  }
  
  return decryptor.decrypt(fernetToken)
}

/**
 * Get content type based on filename
 */
export function getContentType(filename: string, defaultType: string = 'application/octet-stream'): string {
  if (!filename) return defaultType
  
  const ext = filename.toLowerCase().split('.').pop()
  
  // Image types
  if (['jpg', 'jpeg'].includes(ext!)) return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'svg') return 'image/svg+xml'
  
  // Video types
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'webm') return 'video/webm'
  if (ext === 'avi') return 'video/x-msvideo'
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'mkv') return 'video/x-matroska'
  
  return defaultType
}