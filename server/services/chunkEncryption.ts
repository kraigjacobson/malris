/**
 * Unified AES-GCM Encryption Service
 * Provides streaming-friendly encryption for all media files
 */
import { logger } from '~/server/utils/logger'
import { pbkdf2Sync } from 'crypto'

export interface ChunkMetadata {
  chunkSize: number
  totalChunks: number
  encryptionMethod: 'aes-gcm-unified'
  fileSize: number
}

export interface EncryptedChunk {
  data: Buffer
  chunkIndex: number
  iv: Buffer
}

const DEFAULT_CHUNK_SIZE = 1024 * 1024 // 1MB
const SMALL_FILE_CHUNK_SIZE = 64 * 1024 // 64KB for smaller files
const CHUNKING_THRESHOLD = 1024 * 1024 // 1MB - use chunking for files larger than this

/**
 * Determine optimal chunk size based on file size
 */
export function getOptimalChunkSize(fileSize: number): number {
  if (fileSize <= CHUNKING_THRESHOLD) {
    return SMALL_FILE_CHUNK_SIZE
  }
  return DEFAULT_CHUNK_SIZE
}

/**
 * All files now use AES-GCM chunk encryption for consistency
 */
export function shouldUseChunkEncryption(_fileSize: number, _mediaType: string): boolean {
  // Use chunk encryption for all files now
  return true
}

/**
 * Derive proper 32-byte AES-256 key from password using PBKDF2
 */
function deriveEncryptionKey(password: string): Buffer {
  const salt = Buffer.from('comfy_media_salt_v1', 'utf8')
  const iterations = 100000
  return pbkdf2Sync(password, salt, iterations, 32, 'sha256')
}

/**
 * Encrypt data using unified AES-GCM approach
 */
export async function encryptChunked(
  data: Buffer,
  encryptionKey: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<{ encryptedData: Buffer; metadata: ChunkMetadata }> {
    const crypto = await import('crypto')
    
    // Use optimal chunk size if not specified
    const actualChunkSize = chunkSize === DEFAULT_CHUNK_SIZE ? getOptimalChunkSize(data.length) : chunkSize
    const totalChunks = Math.ceil(data.length / actualChunkSize)
    const encryptedChunks: Buffer[] = []
    
    // Derive proper 32-byte key for AES-256
    const derivedKey = deriveEncryptionKey(encryptionKey)
    
    // Generate a file-specific salt from the encryption key
    const fileSalt = crypto.createHash('sha256').update(encryptionKey + 'file_salt').digest()
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * actualChunkSize
      const end = Math.min(start + actualChunkSize, data.length)
      const chunk = data.slice(start, end)
      
      // Generate deterministic IV for this chunk
      const iv = crypto.createHash('sha256')
        .update(fileSalt)
        .update(Buffer.from(i.toString()))
        .digest()
        .slice(0, 16) // AES-GCM uses 16-byte IV
      
      // Encrypt chunk using properly derived 32-byte key
      const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv)
      
      const encrypted = cipher.update(chunk)
      cipher.final()
      const authTag = cipher.getAuthTag()
      
      // Store: IV (16 bytes) + AuthTag (16 bytes) + Encrypted Data
      const chunkWithMetadata = Buffer.concat([iv, authTag, encrypted])
      encryptedChunks.push(chunkWithMetadata)
    }
    
    const encryptedData = Buffer.concat(encryptedChunks)
    
    const metadata: ChunkMetadata = {
      chunkSize: actualChunkSize,
      totalChunks,
      encryptionMethod: 'aes-gcm-unified',
      fileSize: data.length
    }
    
    logger.info(`Encrypted ${data.length} bytes into ${totalChunks} chunks of ${actualChunkSize} bytes each`)
    
    return { encryptedData, metadata }
  }

/**
 * Decrypt specific chunks for range requests
 */
export async function decryptChunkRange(
  encryptedData: Buffer,
  metadata: ChunkMetadata,
  encryptionKey: string,
  startByte: number,
  endByte: number
): Promise<Buffer> {
    const crypto = await import('crypto')
    
    // Calculate which chunks we need
    const startChunk = Math.floor(startByte / metadata.chunkSize)
    const endChunk = Math.floor(endByte / metadata.chunkSize)
    
    const decryptedChunks: Buffer[] = []
    
    // Each encrypted chunk has: IV (16) + AuthTag (16) + Data
    const chunkOverhead = 32 // IV + AuthTag
    
    for (let chunkIndex = startChunk; chunkIndex <= endChunk; chunkIndex++) {
      if (chunkIndex >= metadata.totalChunks) break
      
      // Calculate encrypted chunk size
      const isLastChunk = chunkIndex === metadata.totalChunks - 1
      const originalChunkSize = isLastChunk 
        ? metadata.fileSize - (chunkIndex * metadata.chunkSize)
        : metadata.chunkSize
      const encryptedChunkSize = originalChunkSize + chunkOverhead
      
      // Extract this chunk from the encrypted data
      const chunkStart = chunkIndex * (metadata.chunkSize + chunkOverhead)
      const chunkEnd = chunkStart + encryptedChunkSize
      const encryptedChunk = encryptedData.slice(chunkStart, chunkEnd)
      
      // Extract IV, AuthTag, and encrypted data
      const iv = encryptedChunk.slice(0, 16)
      const authTag = encryptedChunk.slice(16, 32)
      const encryptedChunkData = encryptedChunk.slice(32)
      
      // Derive proper 32-byte key for AES-256
      const derivedKey = deriveEncryptionKey(encryptionKey)
      
      // Decrypt chunk using properly derived 32-byte key
      const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv)
      decipher.setAuthTag(authTag)
      
      const decrypted = decipher.update(encryptedChunkData)
      decipher.final()
      
      decryptedChunks.push(decrypted)
    }
    
    // Concatenate all decrypted chunks
    const fullDecryptedRange = Buffer.concat(decryptedChunks)
    
    // Extract the exact byte range requested
    const rangeStartInChunks = startByte - (startChunk * metadata.chunkSize)
    const rangeEndInChunks = endByte - (startChunk * metadata.chunkSize)
    
    return fullDecryptedRange.slice(rangeStartInChunks, rangeEndInChunks + 1)
  }

/**
 * Decrypt entire file (for non-streaming access)
 */
export async function decryptChunked(
  encryptedData: Buffer,
  metadata: ChunkMetadata,
  encryptionKey: string
): Promise<Buffer> {
  return decryptChunkRange(
    encryptedData,
    metadata,
    encryptionKey,
    0,
    metadata.fileSize - 1
  )
}

/**
 * Get chunk information for a byte range
 */
export function getChunkInfo(
  startByte: number,
  endByte: number,
  chunkSize: number
): {
  startChunk: number
  endChunk: number
  chunksNeeded: number
} {
  const startChunk = Math.floor(startByte / chunkSize)
  const endChunk = Math.floor(endByte / chunkSize)
  const chunksNeeded = endChunk - startChunk + 1
  
  return { startChunk, endChunk, chunksNeeded }
}

/**
 * Calculate encrypted size for chunk-based encryption
 */
export function calculateEncryptedSize(originalSize: number, chunkSize: number): number {
  const totalChunks = Math.ceil(originalSize / chunkSize)
  const overhead = 32 * totalChunks // 16 bytes IV + 16 bytes AuthTag per chunk
  return originalSize + overhead
}