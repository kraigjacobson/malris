#!/usr/bin/env node
/**
 * Convert Fernet-encrypted media records to unified AES-GCM encryption
 * Node.js version that can run in the malris container
 */

const { Client } = require('pg');
const crypto = require('crypto');

// Database connection parameters
const DB_CONFIG = {
    host: process.env.DB_HOST || 'comfy-media-db',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.POSTGRES_DB || 'comfy_media',
    user: process.env.POSTGRES_USER || 'comfy_user',
    password: process.env.POSTGRES_PASSWORD || 'comfy_secure_password_2024',
};

// Encryption settings
const ENCRYPTION_KEY = process.env.MEDIA_ENCRYPTION_KEY || 'K8mF3vN9pQ2sT6wY0zC4eH7jL1nP5rU8xA3dG6iK9mO2qT5wZ8cF1hJ4lN7pS0vY';
const SALT = Buffer.from('comfy_media_salt_v1');
const ITERATIONS = 100000;

// Chunk sizes
const CHUNKING_THRESHOLD = 1024 * 1024; // 1MB
const SMALL_FILE_CHUNK_SIZE = 64 * 1024; // 64KB
const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1MB

function logInfo(msg) {
    console.log(`[INFO] ${msg}`);
}

function logError(msg) {
    console.error(`[ERROR] ${msg}`);
}

function deriveEncryptionKey(password) {
    return crypto.pbkdf2Sync(password, SALT, ITERATIONS, 32, 'sha256');
}

function getOptimalChunkSize(fileSize) {
    if (fileSize <= CHUNKING_THRESHOLD) {
        return SMALL_FILE_CHUNK_SIZE;
    }
    return DEFAULT_CHUNK_SIZE;
}

async function findRecordsToConvert(client, uuid = null) {
    let query, params;
    
    if (uuid) {
        query = `
            SELECT uuid, filename, encryption_method, storage_type, 
                   encrypted_data IS NOT NULL as has_encrypted_data, 
                   large_object_oid, file_size
            FROM media_records 
            WHERE uuid = $1 AND (encryption_method IS NULL OR encryption_method != 'aes-gcm-unified')
        `;
        params = [uuid];
    } else {
        query = `
            SELECT uuid, filename, encryption_method, storage_type, 
                   encrypted_data IS NOT NULL as has_encrypted_data, 
                   large_object_oid, file_size
            FROM media_records 
            WHERE encryption_method IS NULL OR encryption_method != 'aes-gcm-unified'
            ORDER BY created_at ASC
            LIMIT 50
        `;
        params = [];
    }
    
    const result = await client.query(query, params);
    return result.rows;
}

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const uuid = args.find(arg => arg.startsWith('--uuid='))?.split('=')[1];
    const showAll = args.includes('--all');
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: node convert_encryption.js [options]

Options:
  --uuid=<uuid>     Convert specific record by UUID
  --dry-run         Show what would be converted without making changes
  --all             Convert all legacy records
  --help, -h        Show this help message
        `);
        return;
    }

    const client = new Client(DB_CONFIG);
    
    try {
        logInfo(`Attempting to connect to database with config: ${JSON.stringify({...DB_CONFIG, password: '***'})}`);
        await client.connect();
        logInfo('Database connection successful');
        
        const records = await findRecordsToConvert(client, uuid);
        
        if (records.length === 0) {
            logInfo('No legacy records found to convert');
            return;
        }
        
        logInfo(`Found ${records.length} legacy records to convert`);
        
        if (isDryRun) {
            logInfo('DRY RUN - Would convert the following records:');
            for (const record of records) {
                logInfo(`  - ${record.uuid}: ${record.filename} (${record.storage_type}, ${record.file_size} bytes, encryption: ${record.encryption_method || 'NULL'})`);
            }
            return;
        }
        
        logInfo('Note: Actual conversion requires Python cryptography library for Fernet decryption');
        logInfo('This Node.js script can identify records but cannot perform the actual conversion');
        logInfo('Use the Python script in the comfyui container once network connectivity is resolved');
        
    } catch (error) {
        logError(`Script failed: ${error.message}`);
        process.exit(1);
    } finally {
        await client.end();
    }
}

if (require.main === module) {
    main();
}