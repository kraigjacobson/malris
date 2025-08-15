const crypto = require('crypto');
const { pbkdf2Sync } = require('crypto');

// Database connection
const { Pool } = require('pg');

const pool = new Pool({
  host: 'comfy-media-db',
  port: 5432,
  database: 'comfy_media',
  user: 'comfy_user',
  password: 'comfy_secure_password_2024',
});

const ENCRYPTION_KEY = 'K8mF3vN9pQ2sT6wY0zC4eH7jL1nP5rU8xA3dG6iK9mO2qT5wZ8cF1hJ4lN7pS0vY';
const SALT = Buffer.from('comfy_media_salt_v1', 'utf8');
const ITERATIONS = 100000;

// Manual Fernet implementation (copied from malris encryption.ts)
class FernetDecryptor {
  constructor(password) {
    // Generate key using PBKDF2 (same as Python)
    const derivedKey = pbkdf2Sync(password, SALT, ITERATIONS, 32, 'sha256');
    
    // Fernet uses the first 16 bytes for signing, last 16 bytes for encryption
    this.signingKey = derivedKey.subarray(0, 16);
    this.encryptionKey = derivedKey.subarray(16, 32);
  }

  decrypt(encryptedData) {
    try {
      // Fernet token structure:
      // Version (1 byte) | Timestamp (8 bytes) | IV (16 bytes) | Ciphertext (variable) | HMAC (32 bytes)
      
      if (encryptedData.length < 57) { // 1 + 8 + 16 + 0 + 32
        throw new Error('Token too short');
      }
      
      // Parse token components
      const version = encryptedData[0];
      const _timestamp = encryptedData.subarray(1, 9);
      const iv = encryptedData.subarray(9, 25);
      const ciphertext = encryptedData.subarray(25, -32);
      const hmac = encryptedData.subarray(-32);
      
      console.log(`Version: ${version.toString(16)}`);
      console.log(`IV: ${iv.toString('hex')}`);
      console.log(`Ciphertext length: ${ciphertext.length}`);
      console.log(`HMAC: ${hmac.toString('hex')}`);
      
      // Verify version
      if (version !== 0x80) {
        throw new Error(`Invalid Fernet version: ${version}`);
      }
      
      // Verify HMAC
      const dataToSign = encryptedData.subarray(0, -32);
      const expectedHmac = crypto.createHmac('sha256', this.signingKey).update(dataToSign).digest();
      
      console.log(`Expected HMAC: ${expectedHmac.toString('hex')}`);
      
      if (!crypto.timingSafeEqual(hmac, expectedHmac)) {
        throw new Error('HMAC verification failed');
      }
      
      console.log('HMAC verification passed!');
      
      // Decrypt using AES-128-CBC
      const decipher = crypto.createDecipheriv('aes-128-cbc', this.encryptionKey, iv);
      decipher.setAutoPadding(true);
      
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);
      
      return decrypted;
      
    } catch (error) {
      throw new Error(`Fernet decryption failed: ${error.message}`);
    }
  }
}

async function testDecryption() {
  const uuid = '76157c1f-775e-4b3a-b619-c2b4c8285abf';
  
  try {
    const client = await pool.connect();
    
    const result = await client.query(
      'SELECT encrypted_data FROM media_records WHERE uuid = $1',
      [uuid]
    );
    
    if (result.rows.length === 0) {
      console.log('Record not found');
      return;
    }
    
    const encryptedData = result.rows[0].encrypted_data;
    console.log(`Retrieved encrypted data for ${uuid}`);
    console.log(`Encrypted data length: ${encryptedData.length}`);
    console.log(`First 20 bytes: ${encryptedData.subarray(0, 20).toString('hex')}`);
    
    const decryptor = new FernetDecryptor(ENCRYPTION_KEY);
    const decrypted = decryptor.decrypt(encryptedData);
    
    console.log(`Successfully decrypted ${decrypted.length} bytes`);
    console.log(`First 20 bytes of decrypted: ${decrypted.subarray(0, 20).toString('hex')}`);
    
    // Check if it's a valid JPEG
    if (decrypted[0] === 0xff && decrypted[1] === 0xd8) {
      console.log('✓ Decrypted data appears to be a valid JPEG!');
    } else {
      console.log('✗ Decrypted data does not appear to be a valid JPEG');
      console.log(`Expected: ff d8, Got: ${decrypted.subarray(0, 2).toString('hex')}`);
    }
    
    client.release();
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await pool.end();
  }
}

testDecryption();