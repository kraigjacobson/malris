const crypto = require('crypto');
const { pbkdf2Sync } = require('crypto');

// Same constants as TypeScript
const ENCRYPTION_KEY = 'K8mF3vN9pQ2sT6wY0zC4eH7jL1nP5rU8xA3dG6iK9mO2qT5wZ8cF1hJ4lN7pS0vY';
const SALT = Buffer.from('comfy_media_salt_v1', 'utf8');
const ITERATIONS = 100000;

function deriveEncryptionKey(password) {
  return pbkdf2Sync(password, SALT, ITERATIONS, 32, 'sha256');
}

async function testDecryption(uuid) {
  const { Pool } = require('pg');
  
  const pool = new Pool({
    host: 'comfy-media-db',
    port: 5432,
    database: 'comfy_media',
    user: 'comfy_user',
    password: 'comfy_secure_password_2024',
  });

  try {
    const client = await pool.connect();
    
    // Get the record
    const result = await client.query(
      'SELECT encrypted_data, metadata FROM media_records WHERE uuid = $1',
      [uuid]
    );
    
    if (result.rows.length === 0) {
      console.log('Record not found');
      return;
    }
    
    const { encrypted_data, metadata } = result.rows[0];
    const chunkMetadata = metadata; // Already parsed as JSONB
    
    console.log('Metadata:', chunkMetadata);
    console.log('Encrypted data length:', encrypted_data.length);
    
    // Try to decrypt first chunk
    const chunkOverhead = 32; // IV + AuthTag
    const expectedEncryptedChunkSize = chunkMetadata.chunkSize + chunkOverhead;
    
    console.log('Expected encrypted chunk size:', expectedEncryptedChunkSize);
    
    // Extract first chunk
    const firstChunk = encrypted_data.slice(0, expectedEncryptedChunkSize);
    console.log('First chunk length:', firstChunk.length);
    
    // Extract IV, AuthTag, and encrypted data
    const iv = firstChunk.slice(0, 16);
    const authTag = firstChunk.slice(16, 32);
    const encryptedChunkData = firstChunk.slice(32);
    
    console.log('IV length:', iv.length);
    console.log('AuthTag length:', authTag.length);
    console.log('Encrypted chunk data length:', encryptedChunkData.length);
    
    // Derive key
    const derivedKey = deriveEncryptionKey(ENCRYPTION_KEY);
    
    // Try to decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);
    
    try {
      const decrypted = decipher.update(encryptedChunkData);
      decipher.final();
      console.log('Successfully decrypted first chunk, length:', decrypted.length);
    } catch (error) {
      console.log('Decryption failed:', error.message);
    }
    
    client.release();
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await pool.end();
  }
}

// Test with our converted record
testDecryption('9245828a-b256-41c3-b22a-90ab821e0c7a');