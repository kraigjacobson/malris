import { exec } from 'child_process'
import { promisify } from 'util'
import { unlinkSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

interface BackupConfig {
  dbHost: string
  dbPort: string
  dbName: string
  dbUser: string
  dbPassword: string
  encryptionPassphrase: string
  spacesAccessKey: string
  spacesSecretKey: string
  spacesBucket: string
  spacesRegion: string
  spacesEndpoint: string
}

export class DatabaseBackupService {
  private config: BackupConfig

  constructor() {
    this.config = {
      dbHost: process.env.DB_HOST || 'localhost',
      dbPort: process.env.DB_PORT || '5433',
      dbName: process.env.DB_NAME || 'comfy_media',
      dbUser: process.env.DB_USER || 'comfy_user',
      dbPassword: process.env.DB_PASSWORD || '',
      encryptionPassphrase: process.env.BACKUP_ENCRYPTION_PASSPHRASE || '',
      spacesAccessKey: process.env.SPACES_ACCESS_KEY || '',
      spacesSecretKey: process.env.SPACES_SECRET_KEY || '',
      spacesBucket: process.env.SPACES_BUCKET || '',
      spacesRegion: process.env.SPACES_REGION || 'nyc3',
      spacesEndpoint: process.env.SPACES_ENDPOINT || 'nyc3.digitaloceanspaces.com'
    }

    this.validateConfig()
  }

  private validateConfig(): void {
    const required = [
      'dbPassword',
      'encryptionPassphrase',
      'spacesAccessKey',
      'spacesSecretKey',
      'spacesBucket'
    ]

    for (const key of required) {
      if (!this.config[key as keyof BackupConfig]) {
        throw new Error(`Missing required environment variable for backup: ${key}`)
      }
    }
  }

  async createEncryptedBackup(): Promise<{
    success: boolean
    message: string
    backupFile?: string
    size?: string
  }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupFileName = `backup_${this.config.dbName}_${timestamp}`
    const tempDir = tmpdir()
    const dumpFile = join(tempDir, `${backupFileName}.dump`)
    const encryptedFile = join(tempDir, `${backupFileName}.dump.gpg`)

    try {
      console.log('🔒 Starting encrypted database backup...')
      
      // Step 1: Create PostgreSQL dump
      console.log('📦 Creating database dump...')
      const dumpCommand = `PGPASSWORD="${this.config.dbPassword}" pg_dump -h ${this.config.dbHost} -p ${this.config.dbPort} -U ${this.config.dbUser} -d ${this.config.dbName} --format=custom --compress=9 --file="${dumpFile}"`
      
      await execAsync(dumpCommand)
      console.log('✅ Database dump created')

      // Step 2: Encrypt the dump
      console.log('🔐 Encrypting backup...')
      const encryptCommand = `echo "${this.config.encryptionPassphrase}" | gpg --batch --yes --cipher-algo AES256 --compress-algo 2 --symmetric --armor --passphrase-fd 0 --output "${encryptedFile}" "${dumpFile}"`
      
      await execAsync(encryptCommand)
      console.log('✅ Backup encrypted')

      // Step 3: Upload to DigitalOcean Spaces
      console.log('☁️ Uploading to DigitalOcean Spaces...')
      const uploadResult = await this.uploadToSpaces(encryptedFile, `${backupFileName}.dump.gpg`)

      if (!uploadResult.success) {
        throw new Error(`Upload failed: ${uploadResult.message}`)
      }

      // Step 4: Get file size for reporting
      const { stdout: sizeOutput } = await execAsync(`du -h "${encryptedFile}"`)
      const size = sizeOutput.split('\t')[0]

      console.log('✅ Backup completed successfully')

      return {
        success: true,
        message: 'Encrypted backup created and uploaded successfully',
        backupFile: `${backupFileName}.dump.gpg`,
        size
      }

    } catch (error) {
      console.error('❌ Backup failed:', error)
      return {
        success: false,
        message: `Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    } finally {
      // Clean up temporary files
      this.cleanupFiles([dumpFile, encryptedFile])
    }
  }

  private async uploadToSpaces(filePath: string, fileName: string): Promise<{
    success: boolean
    message: string
  }> {
    try {
      // Configure s3cmd for DigitalOcean Spaces
      const s3ConfigContent = `[default]
access_key = ${this.config.spacesAccessKey}
secret_key = ${this.config.spacesSecretKey}
host_base = ${this.config.spacesEndpoint}
host_bucket = %(bucket)s.${this.config.spacesEndpoint}
use_https = True
signature_v2 = False`

      const s3ConfigFile = join(tmpdir(), '.s3cfg')
      writeFileSync(s3ConfigFile, s3ConfigContent)

      const uploadCommand = `s3cmd put "${filePath}" "s3://${this.config.spacesBucket}/postgresql-backups/${fileName}" --config="${s3ConfigFile}" --server-side-encryption`

      await execAsync(uploadCommand)

      // Clean up config file
      this.cleanupFiles([s3ConfigFile])

      return {
        success: true,
        message: 'File uploaded successfully'
      }
    } catch (error) {
      return {
        success: false,
        message: `Upload error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }

  private cleanupFiles(files: string[]): void {
    for (const file of files) {
      try {
        if (existsSync(file)) {
          unlinkSync(file)
          console.log(`🧹 Cleaned up: ${file}`)
        }
      } catch (error) {
        console.warn(`⚠️ Could not clean up file ${file}:`, error)
      }
    }
  }

  async listBackups(): Promise<{
    success: boolean
    backups?: string[]
    message?: string
  }> {
    try {
      const s3ConfigContent = `[default]
access_key = ${this.config.spacesAccessKey}
secret_key = ${this.config.spacesSecretKey}
host_base = ${this.config.spacesEndpoint}
host_bucket = %(bucket)s.${this.config.spacesEndpoint}
use_https = True
signature_v2 = False`

      const s3ConfigFile = join(tmpdir(), '.s3cfg')
      writeFileSync(s3ConfigFile, s3ConfigContent)

      const listCommand = `s3cmd ls "s3://${this.config.spacesBucket}/postgresql-backups/" --config="${s3ConfigFile}"`
      const { stdout } = await execAsync(listCommand)

      // Clean up config file
      this.cleanupFiles([s3ConfigFile])

      const backups = stdout
        .split('\n')
        .filter(line => line.trim() && line.includes('.dump.gpg'))
        .map(line => {
          const parts = line.trim().split(/\s+/)
          return {
            date: parts[0],
            time: parts[1],
            size: parts[2],
            file: parts[3].split('/').pop()
          }
        })

      return {
        success: true,
        backups: backups.map(b => `${b.file} (${b.size}, ${b.date} ${b.time})`)
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to list backups: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }
}