/**
 * Hybrid Media Storage Service
 * Handles both BYTEA and PostgreSQL Large Object storage based on file size
 * Supports both full-file and chunk-based encryption for optimal streaming
 */
import { logger } from '~/server/utils/logger'
import {
  encryptChunked,
  decryptChunkRange,
  decryptChunked,
  getOptimalChunkSize,
  type ChunkMetadata
} from './chunkEncryption'

export interface StorageResult {
  uuid: string
  storageType: 'bytea' | 'lob'
  size: number
}

export interface MediaStorageOptions {
  filename: string
  type: string
  purpose: string
  subjectUuid?: string
  sizeThreshold?: number
  encryptionKey?: string
  chunkSize?: number
}

export interface StreamRange {
  start: number
  end: number
  size: number
}

const DEFAULT_THRESHOLD = 100 * 1024 * 1024 // 100MB
const CHUNK_SIZE = 64 * 1024 // 64KB chunks for LOB operations

/**
 * Store media data using hybrid approach
 */
export async function storeMedia(
  fileBuffer: Buffer, 
  options: MediaStorageOptions
): Promise<StorageResult> {
  const { getDbClient } = await import('~/server/utils/database')
  
  const client = await getDbClient()
  const threshold = options.sizeThreshold || DEFAULT_THRESHOLD
  const encryptionKey = options.encryptionKey || process.env.MEDIA_ENCRYPTION_KEY || 'default_key'
  
  try {
    // Use unified AES-GCM encryption for all files
    const chunkSize = options.chunkSize || getOptimalChunkSize(fileBuffer.length)
    const result = await encryptChunked(fileBuffer, encryptionKey, chunkSize)
    const encryptedData = result.encryptedData
    const chunkMetadata = result.metadata
    const encryptionMethod = 'aes-gcm-unified'
    
    const fileSize = encryptedData.length
    
    // Calculate checksum
    const crypto = await import('crypto')
    const checksum = crypto.createHash('sha256').update(encryptedData).digest('hex')
    
    if (fileSize <= threshold) {
      // Use BYTEA storage for smaller files
      return await storeBytea(client, encryptedData, fileSize, checksum, options, encryptionMethod, chunkMetadata)
    } else {
      // Use Large Object storage for larger files
      return await storeLargeObject(client, encryptedData, fileSize, checksum, options, threshold, encryptionMethod, chunkMetadata)
    }
  } catch (error) {
    logger.error('Failed to store media:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Store using BYTEA method
 */
async function storeBytea(
  client: any,
  encryptedData: Buffer,
  fileSize: number,
  checksum: string,
  options: MediaStorageOptions,
  encryptionMethod: 'aes-gcm-unified',
  chunkMetadata: ChunkMetadata
): Promise<StorageResult> {
  const metadata = JSON.stringify(chunkMetadata)
  
  const result = await client.query(`
    INSERT INTO media_records (
      filename, type, purpose, encrypted_data, file_size, original_size,
      storage_type, checksum, subject_uuid, encryption_method, chunk_size, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, 'bytea', $7, $8, $9, $10, $11)
    RETURNING uuid
  `, [
    options.filename,
    options.type,
    options.purpose,
    encryptedData,
    fileSize,
    fileSize,
    checksum,
    options.subjectUuid || null,
    encryptionMethod,
    chunkMetadata.chunkSize,
    metadata
  ])

  logger.info(`Stored media ${result.rows[0].uuid} using BYTEA (${fileSize} bytes)`)
  
  return {
    uuid: result.rows[0].uuid,
    storageType: 'bytea',
    size: fileSize
  }
}

/**
 * Store using Large Object method
 */
async function storeLargeObject(
  client: any,
  encryptedData: Buffer,
  fileSize: number,
  checksum: string,
  options: MediaStorageOptions,
  threshold: number,
  encryptionMethod: 'aes-gcm-unified',
  chunkMetadata: ChunkMetadata
): Promise<StorageResult> {
  await client.query('BEGIN')
  
  try {
    logger.info('Creating large object for file:', options.filename)
    
    // Create large object
    const oidResult = await client.query('SELECT lo_create(0)')
    const oid = oidResult.rows[0].lo_create
    logger.info('Created large object with OID:', oid)
    
    // Open for writing
    logger.info('Opening large object for writing, OID:', oid)
    const fdResult = await client.query('SELECT lo_open($1, 131072)', [oid]) // Write mode
    const fd = fdResult.rows[0].lo_open
    logger.info('Opened large object with FD:', fd)
    
    // Write data in chunks
    let offset = 0
    logger.info(`Starting to write ${encryptedData.length} bytes in chunks of ${CHUNK_SIZE}`)
    
    while (offset < encryptedData.length) {
      const chunkEnd = Math.min(offset + CHUNK_SIZE, encryptedData.length)
      const chunk = encryptedData.slice(offset, chunkEnd)
      
      logger.info(`Writing chunk: offset=${offset}, size=${chunk.length}, fd=${fd}`)
      await client.query('SELECT lowrite($1, $2)', [fd, chunk])
      offset = chunkEnd
    }
    
    logger.info('Finished writing all chunks')
    
    // Close the large object
    await client.query('SELECT lo_close($1)', [fd])
    
    // Insert record
    const metadata = JSON.stringify(chunkMetadata)
    
    // Debug logging
    logger.info('Inserting large object record with parameters:', {
      filename: options.filename,
      type: options.type,
      purpose: options.purpose,
      oid: oid,
      oidType: typeof oid,
      fileSize: fileSize,
      threshold: threshold,
      checksum: checksum,
      subjectUuid: options.subjectUuid,
      encryptionMethod: encryptionMethod,
      chunkSize: chunkMetadata.chunkSize,
      metadata: metadata
    })
    
    const result = await client.query(`
      INSERT INTO media_records (
        filename, type, purpose, large_object_oid, file_size, original_size,
        storage_type, size_threshold, checksum, subject_uuid, encryption_method, chunk_size, metadata
      ) VALUES ($1, $2, $3, $4::integer, $5, $6, 'lob', $7, $8, $9, $10, $11, $12)
      RETURNING uuid
    `, [
      options.filename,
      options.type,
      options.purpose,
      oid,
      fileSize,
      fileSize,
      threshold,
      checksum,
      options.subjectUuid || null,
      encryptionMethod,
      chunkMetadata.chunkSize,
      metadata
    ])
    
    await client.query('COMMIT')
    
    logger.info(`Stored media ${result.rows[0].uuid} using Large Object (${fileSize} bytes, OID: ${oid})`)
    
    return {
      uuid: result.rows[0].uuid,
      storageType: 'lob',
      size: fileSize
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

/**
 * Retrieve media data using hybrid approach
 */
export async function retrieveMedia(uuid: string): Promise<Buffer | null> {
  const { getDbClient } = await import('~/server/utils/database')
  
  const client = await getDbClient()
  
  try {
    // Get storage info
    const record = await client.query(`
      SELECT storage_type, encrypted_data, large_object_oid, file_size, encryption_method, metadata
      FROM media_records WHERE uuid = $1
    `, [uuid])
    
    if (record.rows.length === 0) {
      return null
    }
    
    const { storage_type, encrypted_data, large_object_oid, file_size, encryption_method, metadata } = record.rows[0]
    
    // Update access tracking
    await client.query(
      'UPDATE media_records SET last_accessed = NOW(), access_count = access_count + 1 WHERE uuid = $1',
      [uuid]
    )
    
    let encryptedBuffer: Buffer
    
    if (storage_type === 'bytea') {
      encryptedBuffer = encrypted_data
    } else {
      // Read from Large Object
      encryptedBuffer = await readLargeObject(client, large_object_oid, file_size)
    }
    
    // Decrypt the data based on encryption method
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY || 'default_key'
    
    if (encryption_method === 'aes-gcm-unified' && metadata) {
      // New unified AES-GCM encryption
      const chunkMetadata = (typeof metadata === 'string' ? JSON.parse(metadata) : metadata) as ChunkMetadata
      return await decryptChunked(encryptedBuffer, chunkMetadata, encryptionKey)
    } else if (encryption_method === 'chunk-based' && metadata) {
      // Legacy chunk-based encryption
      const chunkMetadata = (typeof metadata === 'string' ? JSON.parse(metadata) : metadata) as ChunkMetadata
      return await decryptChunked(encryptedBuffer, chunkMetadata, encryptionKey)
    } else {
      // Legacy Fernet full-file decryption
      const { decryptMediaData } = await import('~/server/utils/encryption')
      return decryptMediaData(encryptedBuffer, encryptionKey)
    }
    
  } catch (error) {
    logger.error(`Failed to retrieve media ${uuid}:`, error)
    return null
  } finally {
    client.release()
  }
}

/**
 * Stream media data with range support (for large objects)
 */
export async function streamMedia(uuid: string, range?: StreamRange): Promise<{
  buffer: Buffer
  totalSize: number
  storageType: 'bytea' | 'lob'
} | null> {
  const { getDbClient } = await import('~/server/utils/database')
  
  const client = await getDbClient()
  
  try {
    // Get storage info
    const record = await client.query(`
      SELECT storage_type, encrypted_data, large_object_oid, file_size, filename, encryption_method, metadata
      FROM media_records WHERE uuid = $1
    `, [uuid])
    
    if (record.rows.length === 0) {
      logger.error(`No record found for UUID: ${uuid}`)
      return null
    }
    
    const { storage_type, encrypted_data, large_object_oid, file_size, encryption_method, metadata } = record.rows[0]
    
    logger.info(`Processing ${storage_type} storage for UUID: ${uuid}, encryption: ${encryption_method}, LOB OID: ${large_object_oid}`)
    
    // Update access tracking
    await client.query(
      'UPDATE media_records SET last_accessed = NOW(), access_count = access_count + 1 WHERE uuid = $1',
      [uuid]
    )
    
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY || 'default_key'
    
    if (storage_type === 'bytea') {
      // For BYTEA, we still need to load everything (but this should be small files)
      const encryptedBuffer = encrypted_data
      
      if ((encryption_method === 'aes-gcm-unified' || encryption_method === 'chunk-based') && metadata) {
        const chunkMetadata = (typeof metadata === 'string' ? JSON.parse(metadata) : metadata) as ChunkMetadata
        if (range) {
          const decryptedData = await decryptChunkRange(encryptedBuffer, chunkMetadata, encryptionKey, range.start, range.end)
          return {
            buffer: decryptedData,
            totalSize: chunkMetadata.fileSize,
            storageType: 'bytea'
          }
        } else {
          const decryptedData = await decryptChunked(encryptedBuffer, chunkMetadata, encryptionKey)
          return {
            buffer: decryptedData,
            totalSize: chunkMetadata.fileSize,
            storageType: 'bytea'
          }
        }
      } else {
        // Legacy Fernet full-file decryption
        const { decryptMediaData } = await import('~/server/utils/encryption')
        const decryptedData = decryptMediaData(encryptedBuffer, encryptionKey)
        
        if (range) {
          const rangedData = decryptedData.subarray(range.start, range.end + 1)
          return {
            buffer: rangedData,
            totalSize: file_size,
            storageType: 'bytea'
          }
        } else {
          return {
            buffer: decryptedData,
            totalSize: file_size,
            storageType: 'bytea'
          }
        }
      }
    } else {
      // For Large Objects with chunk-based encryption, we can stream efficiently
      if ((encryption_method === 'aes-gcm-unified' || encryption_method === 'chunk-based') && metadata) {
        const chunkMetadata = (typeof metadata === 'string' ? JSON.parse(metadata) : metadata) as ChunkMetadata
        
        if (range) {
          // Calculate which encrypted chunks we need for this range
          const chunkOverhead = 32 // IV + AuthTag per chunk
          const encryptedChunkSize = chunkMetadata.chunkSize + chunkOverhead
          
          const startChunk = Math.floor(range.start / chunkMetadata.chunkSize)
          const endChunk = Math.floor(range.end / chunkMetadata.chunkSize)
          
          const encryptedStart = startChunk * encryptedChunkSize
          const encryptedEnd = (endChunk + 1) * encryptedChunkSize - 1
          
          const encryptedBuffer = await readLargeObjectRange(client, large_object_oid, encryptedStart, encryptedEnd)
          const decryptedData = await decryptChunkRange(encryptedBuffer, chunkMetadata, encryptionKey, range.start, range.end)
          
          return {
            buffer: decryptedData,
            totalSize: chunkMetadata.fileSize,
            storageType: 'lob'
          }
        } else {
          logger.info(`Reading full large object ${large_object_oid} with file size ${file_size}`)
          const encryptedBuffer = await readLargeObject(client, large_object_oid, file_size)
          logger.info(`Read ${encryptedBuffer.length} encrypted bytes from large object`)
          
          try {
            const decryptedData = await decryptChunked(encryptedBuffer, chunkMetadata, encryptionKey)
            logger.info(`Decrypted to ${decryptedData.length} bytes`)
            
            return {
              buffer: decryptedData,
              totalSize: chunkMetadata.fileSize,
              storageType: 'lob'
            }
          } catch (decryptError) {
            logger.error(`Decryption failed for LOB ${large_object_oid}:`, decryptError)
            throw decryptError
          }
        }
      } else {
        // Legacy Fernet full-file encryption for Large Objects
        let encryptedBuffer: Buffer
        
        if (range) {
          encryptedBuffer = await readLargeObjectRange(client, large_object_oid, range.start, range.end)
        } else {
          encryptedBuffer = await readLargeObject(client, large_object_oid, file_size)
        }
        
        const { decryptMediaData } = await import('~/server/utils/encryption')
        const decryptedData = decryptMediaData(encryptedBuffer, encryptionKey)
        
        return {
          buffer: decryptedData,
          totalSize: file_size,
          storageType: 'lob'
        }
      }
    }
    
  } catch (error) {
    logger.error(`Failed to stream media ${uuid}:`, error)
    return null
  } finally {
    client.release()
  }
}

/**
 * Read Large Object data
 */
async function readLargeObject(
  client: any,
  oid: number,
  fileSize: number
): Promise<Buffer> {
  await client.query('BEGIN')
  
  try {
    // Check if large object exists first
    const existsResult = await client.query('SELECT oid FROM pg_largeobject_metadata WHERE oid = $1', [oid])
    if (existsResult.rows.length === 0) {
      throw new Error(`Large object with OID ${oid} does not exist`)
    }
    
    // Open for reading
    const fdResult = await client.query('SELECT lo_open($1, 262144)', [oid]) // Read mode
    const fd = fdResult.rows[0].lo_open
    
    if (fd < 0) {
      throw new Error(`Failed to open large object with OID ${oid}, fd: ${fd}`)
    }
    
    const chunks: Buffer[] = []
    let totalRead = 0
    
    while (totalRead < fileSize) {
      const chunkResult = await client.query('SELECT loread($1, $2)', [fd, CHUNK_SIZE])
      const chunk = chunkResult.rows[0].loread
      
      if (!chunk || chunk.length === 0) break
      
      chunks.push(chunk)
      totalRead += chunk.length
    }
    
    await client.query('SELECT lo_close($1)', [fd])
    await client.query('COMMIT')
    
    return Buffer.concat(chunks)
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error(`Failed to read large object ${oid}:`, error)
    throw error
  }
}

/**
 * Read Large Object data with range support
 */
async function readLargeObjectRange(
  client: any,
  oid: number,
  start: number,
  end: number
): Promise<Buffer> {
  await client.query('BEGIN')
  
  try {
    // Check if large object exists first
    const existsResult = await client.query('SELECT oid FROM pg_largeobject_metadata WHERE oid = $1', [oid])
    if (existsResult.rows.length === 0) {
      throw new Error(`Large object with OID ${oid} does not exist`)
    }
    
    // Open for reading
    const fdResult = await client.query('SELECT lo_open($1, 262144)', [oid]) // Read mode
    const fd = fdResult.rows[0].lo_open
    
    if (fd < 0) {
      throw new Error(`Failed to open large object with OID ${oid}, fd: ${fd}`)
    }
    
    // Seek to start position
    await client.query('SELECT lo_lseek($1, $2, 0)', [fd, start]) // SEEK_SET = 0
    
    const chunks: Buffer[] = []
    let totalRead = 0
    const rangeSize = end - start + 1
    
    while (totalRead < rangeSize) {
      const remainingBytes = rangeSize - totalRead
      const chunkSize = Math.min(CHUNK_SIZE, remainingBytes)
      
      const chunkResult = await client.query('SELECT loread($1, $2)', [fd, chunkSize])
      const chunk = chunkResult.rows[0].loread
      
      if (!chunk || chunk.length === 0) break
      
      chunks.push(chunk)
      totalRead += chunk.length
    }
    
    await client.query('SELECT lo_close($1)', [fd])
    await client.query('COMMIT')
    
    return Buffer.concat(chunks)
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error(`Failed to read large object range ${oid} (${start}-${end}):`, error)
    throw error
  }
}

/**
 * Get media info without loading data
 */
export async function getMediaInfo(uuid: string): Promise<{
  filename: string
  type: string
  storageType: 'bytea' | 'lob'
  fileSize: number
} | null> {
  const { getDbClient } = await import('~/server/utils/database')
  const client = await getDbClient()
  
  try {
    const record = await client.query(`
      SELECT filename, type, storage_type, file_size
      FROM media_records WHERE uuid = $1
    `, [uuid])
    
    if (record.rows.length === 0) {
      return null
    }
    
    const row = record.rows[0]
    return {
      filename: row.filename,
      type: row.type,
      storageType: row.storage_type,
      fileSize: parseInt(row.file_size, 10)
    }
  } catch (error) {
    logger.error(`Failed to get media info ${uuid}:`, error)
    return null
  } finally {
    client.release()
  }
}

/**
 * Clean up orphaned large objects
 */
export async function cleanupOrphanedLargeObjects(): Promise<number> {
  const { getDbClient } = await import('~/server/utils/database')
  const client = await getDbClient()
  
  try {
    const result = await client.query('SELECT cleanup_orphaned_large_objects()')
    const cleanedCount = result.rows[0].cleanup_orphaned_large_objects
    
    logger.info(`Cleaned up ${cleanedCount} orphaned large objects`)
    return cleanedCount
  } catch (error) {
    logger.error('Failed to cleanup orphaned large objects:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Migrate existing BYTEA records to Large Objects if they exceed threshold
 */
export async function migrateLargeBytea(threshold?: number): Promise<number> {
  const { getDbClient } = await import('~/server/utils/database')
  const client = await getDbClient()
  
  try {
    const migrationThreshold = threshold || DEFAULT_THRESHOLD
    const result = await client.query('SELECT migrate_large_bytea_to_lob($1)', [migrationThreshold])
    const migratedCount = result.rows[0].migrate_large_bytea_to_lob
    
    logger.info(`Migrated ${migratedCount} records from BYTEA to Large Objects`)
    return migratedCount
  } catch (error) {
    logger.error('Failed to migrate large BYTEA records:', error)
    throw error
  } finally {
    client.release()
  }
}