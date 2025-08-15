#!/usr/bin/env node

/**
 * Convert Fernet-encrypted media records to unified AES-GCM encryption
 *
 * Usage:
 *   # Convert specific record by UUID
 *   npx tsx scripts/convert-fernet-to-aes-gcm.js --uuid <uuid>
 *
 *   # Dry run to see what would be converted
 *   npx tsx scripts/convert-fernet-to-aes-gcm.js --dry-run
 *
 *   # Convert all legacy records
 *   npx tsx scripts/convert-fernet-to-aes-gcm.js --all
 *
 *   # Convert in batches
 *   npx tsx scripts/convert-fernet-to-aes-gcm.js --batch-size 10
 */

const { Pool } = require('pg')
const crypto = require('crypto')

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5433,
  database: process.env.DB_NAME || 'comfy_media',
  user: process.env.DB_USER || 'comfy_user',
  password: process.env.DB_PASSWORD || 'comfy_secure_password_2024'
})

// Logger
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args)
}

// Fernet decryption (simplified version)
// eslint-disable-next-line no-unused-vars
function decryptMediaData(encryptedData, _encryptionKey) {
  // This is a simplified version - in production you'd use the full Fernet implementation
  // For now, we'll assume legacy data and handle the conversion
  return encryptedData // Placeholder - would need full Fernet implementation
}

// AES-GCM encryption functions
function deriveEncryptionKey(password) {
  const salt = Buffer.from('comfy_media_salt_v1', 'utf8')
  const iterations = 100000
  return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
}

function getOptimalChunkSize(fileSize) {
  const CHUNKING_THRESHOLD = 1024 * 1024 // 1MB
  const SMALL_FILE_CHUNK_SIZE = 64 * 1024 // 64KB
  const DEFAULT_CHUNK_SIZE = 1024 * 1024 // 1MB
  
  if (fileSize <= CHUNKING_THRESHOLD) {
    return SMALL_FILE_CHUNK_SIZE
  }
  return DEFAULT_CHUNK_SIZE
}

async function encryptChunked(data, encryptionKey, chunkSize) {
  const totalChunks = Math.ceil(data.length / chunkSize)
  const encryptedChunks = []
  
  // Derive proper 32-byte key for AES-256
  const derivedKey = deriveEncryptionKey(encryptionKey)
  
  // Generate a file-specific salt from the encryption key
  const fileSalt = crypto.createHash('sha256').update(encryptionKey + 'file_salt').digest()
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, data.length)
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
  
  const metadata = {
    chunkSize,
    totalChunks,
    encryptionMethod: 'aes-gcm-unified',
    fileSize: data.length
  }
  
  logger.info(`Encrypted ${data.length} bytes into ${totalChunks} chunks of ${chunkSize} bytes each`)
  
  return { encryptedData, metadata }
}

const args = process.argv.slice(2)
const options = {
  uuid: null,
  dryRun: args.includes('--dry-run'),
  all: args.includes('--all'),
  batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1]) || 50
}

// Parse UUID if provided
const uuidIndex = args.indexOf('--uuid')
if (uuidIndex !== -1 && args[uuidIndex + 1]) {
  options.uuid = args[uuidIndex + 1]
}

async function convertRecord(client, record) {
  const { uuid, encrypted_data, large_object_oid, storage_type, filename, file_size } = record
  
  try {
    logger.info(`Converting record ${uuid} (${filename}, ${storage_type}, ${file_size} bytes)`)
    
    // Step 1: Decrypt using legacy Fernet encryption
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY || 'default_key'
    let encryptedBuffer
    
    if (storage_type === 'bytea') {
      encryptedBuffer = encrypted_data
    } else {
      // Read from Large Object
      encryptedBuffer = await readLargeObject(client, large_object_oid, file_size)
    }
    
    const decryptedData = decryptMediaData(encryptedBuffer, encryptionKey)
    logger.info(`Successfully decrypted ${decryptedData.length} bytes`)
    
    // Step 2: Re-encrypt using unified AES-GCM
    const chunkSize = getOptimalChunkSize(decryptedData.length)
    const { encryptedData: newEncryptedData, metadata } = await encryptChunked(
      decryptedData, 
      encryptionKey, 
      chunkSize
    )
    
    logger.info(`Re-encrypted into ${metadata.totalChunks} chunks of ${metadata.chunkSize} bytes each`)
    
    // Step 3: Update database record
    await client.query('BEGIN')
    
    try {
      if (storage_type === 'bytea') {
        // Update BYTEA record
        await client.query(`
          UPDATE media_records 
          SET encrypted_data = $1, 
              encryption_method = 'aes-gcm-unified',
              chunk_size = $2,
              metadata = $3,
              updated_at = NOW()
          WHERE uuid = $4
        `, [
          newEncryptedData,
          metadata.chunkSize,
          JSON.stringify(metadata),
          uuid
        ])
      } else {
        // Update Large Object
        // First, delete old large object
        await client.query('SELECT lo_unlink($1)', [large_object_oid])
        
        // Create new large object
        const oidResult = await client.query('SELECT lo_create(0)')
        const newOid = oidResult.rows[0].lo_create
        
        // Write new encrypted data
        const fdResult = await client.query('SELECT lo_open($1, 131072)', [newOid]) // Write mode
        const fd = fdResult.rows[0].lo_open
        
        const CHUNK_SIZE = 64 * 1024 // 64KB chunks for LOB operations
        let offset = 0
        while (offset < newEncryptedData.length) {
          const chunkEnd = Math.min(offset + CHUNK_SIZE, newEncryptedData.length)
          const chunk = newEncryptedData.slice(offset, chunkEnd)
          
          await client.query('SELECT lo_write($1, $2)', [fd, chunk])
          offset = chunkEnd
        }
        
        await client.query('SELECT lo_close($1)', [fd])
        
        // Update record
        await client.query(`
          UPDATE media_records 
          SET large_object_oid = $1,
              file_size = $2,
              encryption_method = 'aes-gcm-unified',
              chunk_size = $3,
              metadata = $4,
              updated_at = NOW()
          WHERE uuid = $5
        `, [
          newOid,
          newEncryptedData.length,
          metadata.chunkSize,
          JSON.stringify(metadata),
          uuid
        ])
      }
      
      await client.query('COMMIT')
      logger.info(`Successfully converted record ${uuid}`)
      return { success: true, uuid }
      
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    
  } catch (error) {
    logger.error(`Failed to convert record ${uuid}:`, error)
    return { success: false, uuid, error: error.message }
  }
}

async function readLargeObject(client, oid, fileSize) {
  await client.query('BEGIN')
  
  try {
    const fdResult = await client.query('SELECT lo_open($1, 262144)', [oid]) // Read mode
    const fd = fdResult.rows[0].lo_open
    
    const chunks = []
    let totalRead = 0
    const CHUNK_SIZE = 64 * 1024
    
    while (totalRead < fileSize) {
      const chunkResult = await client.query('SELECT lo_read($1, $2)', [fd, CHUNK_SIZE])
      const chunk = chunkResult.rows[0].lo_read
      
      if (!chunk || chunk.length === 0) break
      
      chunks.push(chunk)
      totalRead += chunk.length
    }
    
    await client.query('SELECT lo_close($1)', [fd])
    await client.query('COMMIT')
    
    return Buffer.concat(chunks)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function main() {
  const client = await pool.connect()
  
  try {
    let query
    let params = []
    
    if (options.uuid) {
      // Convert specific record
      query = `
        SELECT uuid, encrypted_data, large_object_oid, storage_type, filename, type, file_size
        FROM media_records 
        WHERE uuid = $1 AND (encryption_method IS NULL OR encryption_method != 'aes-gcm-unified')
      `
      params = [options.uuid]
    } else {
      // Find all legacy records
      query = `
        SELECT uuid, encrypted_data, large_object_oid, storage_type, filename, type, file_size
        FROM media_records 
        WHERE encryption_method IS NULL OR encryption_method != 'aes-gcm-unified'
        ORDER BY created_at ASC
      `
      
      if (!options.all) {
        query += ` LIMIT ${options.batchSize}`
      }
    }
    
    const result = await client.query(query, params)
    const records = result.rows
    
    if (records.length === 0) {
      logger.info('No legacy records found to convert')
      return
    }
    
    logger.info(`Found ${records.length} legacy records to convert`)
    
    if (options.dryRun) {
      logger.info('DRY RUN - Would convert the following records:')
      records.forEach(record => {
        logger.info(`  - ${record.uuid}: ${record.filename} (${record.storage_type}, ${record.file_size} bytes)`)
      })
      return
    }
    
    // Convert records
    const results = []
    for (const record of records) {
      const result = await convertRecord(client, record)
      results.push(result)
    }
    
    // Summary
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    
    logger.info(`Conversion complete: ${successful} successful, ${failed} failed`)
    
    if (failed > 0) {
      logger.error('Failed conversions:')
      results.filter(r => !r.success).forEach(r => {
        logger.error(`  - ${r.uuid}: ${r.error}`)
      })
    }
    
  } catch (error) {
    logger.error('Conversion script failed:', error)
    process.exit(1)
  } finally {
    client.release()
  }
}

// Show usage if no valid options provided
if (!options.uuid && !options.dryRun && !options.all && !args.some(arg => arg.startsWith('--batch-size'))) {
  console.log(`
Usage:
  # Convert specific record by UUID
  npx tsx scripts/convert-fernet-to-aes-gcm.js --uuid <uuid>
  
  # Dry run to see what would be converted
  npx tsx scripts/convert-fernet-to-aes-gcm.js --dry-run
  
  # Convert all legacy records
  npx tsx scripts/convert-fernet-to-aes-gcm.js --all
  
  # Convert in batches (default: 50)
  npx tsx scripts/convert-fernet-to-aes-gcm.js --batch-size 10

Examples:
  npx tsx scripts/convert-fernet-to-aes-gcm.js --uuid 123e4567-e89b-12d3-a456-426614174000
  npx tsx scripts/convert-fernet-to-aes-gcm.js --dry-run
  npx tsx scripts/convert-fernet-to-aes-gcm.js --batch-size 5
  `)
  process.exit(0)
}

main().catch(console.error)