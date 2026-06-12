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
      console.log(`🔧 Command: pg_dump --format=custom --compress=9`)
      
      const dumpCommand = `PGPASSWORD="${this.config.dbPassword}" pg_dump -h ${this.config.dbHost} -p ${this.config.dbPort} -U ${this.config.dbUser} -d ${this.config.dbName} --format=custom --compress=9 --verbose --file="${dumpFile}"`
      
      const startTime = Date.now()
      console.log(`⏰ Dump started at: ${new Date().toISOString()}`)
      
      // Start progress monitoring
      const progressMonitor = this.startProgressMonitoring(dumpFile, startTime)
      
      try {
        await execAsync(dumpCommand)
      } finally {
        // Stop progress monitoring
        if (progressMonitor) {
          clearInterval(progressMonitor)
        }
      }
      
      const dumpDuration = Math.round((Date.now() - startTime) / 1000)
      console.log(`✅ Database dump created in ${Math.floor(dumpDuration / 60)}m ${dumpDuration % 60}s`)

      // Step 2: Encrypt the dump
      console.log('🔐 Encrypting backup...')
      
      // Get dump file size for progress tracking
      const { stdout: dumpSizeOutput } = await execAsync(`du -h "${dumpFile}"`)
      const dumpSize = dumpSizeOutput.split('\t')[0]
      console.log(`📊 Dump file size: ${dumpSize}`)
      console.log(`🔧 Encryption: GPG AES256 with compression`)
      
      const encryptStartTime = Date.now()
      console.log(`⏰ Encryption started at: ${new Date().toISOString()}`)
      
      const encryptCommand = `echo "${this.config.encryptionPassphrase}" | gpg --batch --yes --cipher-algo AES256 --compress-algo 2 --symmetric --armor --passphrase-fd 0 --output "${encryptedFile}" "${dumpFile}"`
      
      await execAsync(encryptCommand)
      
      const encryptDuration = Math.round((Date.now() - encryptStartTime) / 1000)
      console.log(`✅ Backup encrypted in ${Math.floor(encryptDuration / 60)}m ${encryptDuration % 60}s`)

      // Step 3: Upload to DigitalOcean Spaces
      console.log('☁️ Uploading to DigitalOcean Spaces...')
      
      // Get encrypted file size for progress tracking
      const { stdout: encryptedSizeOutput } = await execAsync(`du -h "${encryptedFile}"`)
      const encryptedSize = encryptedSizeOutput.split('\t')[0]
      console.log(`📊 Encrypted file size: ${encryptedSize}`)
      console.log(`🌐 Destination: s3://${this.config.spacesBucket}/postgresql-backups/`)
      
      const uploadStartTime = Date.now()
      console.log(`⏰ Upload started at: ${new Date().toISOString()}`)
      
      const uploadResult = await this.uploadToSpaces(encryptedFile, `${backupFileName}.dump.gpg`)

      if (!uploadResult.success) {
        throw new Error(`Upload failed: ${uploadResult.message}`)
      }
      
      const uploadDuration = Math.round((Date.now() - uploadStartTime) / 1000)
      console.log(`✅ Upload completed in ${Math.floor(uploadDuration / 60)}m ${uploadDuration % 60}s`)

      // Step 4: Clean up old backups (keep only 3 most recent)
      console.log('🧹 Cleaning up old backups...')
      const cleanupStartTime = Date.now()
      await this.cleanupOldBackups()
      const cleanupDuration = Math.round((Date.now() - cleanupStartTime) / 1000)
      console.log(`✅ Cleanup completed in ${cleanupDuration}s`)

      // Step 5: Get final file size for reporting
      const { stdout: sizeOutput } = await execAsync(`du -h "${encryptedFile}"`)
      const size = sizeOutput.split('\t')[0]

      const totalDuration = Math.round((Date.now() - startTime) / 1000)
      console.log('✅ Backup completed successfully')
      console.log(`📊 Total backup time: ${Math.floor(totalDuration / 3600)}h ${Math.floor((totalDuration % 3600) / 60)}m ${totalDuration % 60}s`)
      console.log(`📁 Final backup file: ${backupFileName}.dump.gpg (${size})`)

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

      const uploadCommand = `s3cmd put "${filePath}" "s3://${this.config.spacesBucket}/postgresql-backups/${fileName}" --config="${s3ConfigFile}" --server-side-encryption --progress`

      console.log(`🚀 Starting upload to Spaces...`)
      await execAsync(uploadCommand)
      console.log(`✅ Upload successful`)

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

  private async cleanupOldBackups(): Promise<void> {
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

      // List all backup files
      const listCommand = `s3cmd ls "s3://${this.config.spacesBucket}/postgresql-backups/" --config="${s3ConfigFile}"`
      const { stdout } = await execAsync(listCommand)

      // Parse backup files and sort by date (newest first)
      const backupFiles = stdout
        .split('\n')
        .filter(line => line.trim() && line.includes('.dump.gpg'))
        .map(line => {
          const parts = line.trim().split(/\s+/)
          const dateStr = parts[0]
          const timeStr = parts[1]
          const size = parts[2]
          const fullPath = parts[3]
          const fileName = fullPath.split('/').pop()
          
          return {
            date: new Date(`${dateStr} ${timeStr}`),
            size,
            fileName,
            fullPath
          }
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime()) // Sort newest first

      console.log(`📊 Found ${backupFiles.length} backup files`)
      
      if (backupFiles.length > 0) {
        console.log(`📋 Backup retention analysis:`)
        backupFiles.forEach((file, index) => {
          const status = index < 3 ? '✅ KEEP' : '🗑️ DELETE'
          const safeFileName = file.fileName?.replace(/backup_.*?_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/, 'backup_***_$1') || 'unknown'
          console.log(`   ${status} ${safeFileName} (${file.size})`)
        })
      }

      // Keep only the 3 most recent, delete the rest
      if (backupFiles.length > 3) {
        const filesToDelete = backupFiles.slice(3) // Everything after the first 3
        
        console.log(`🗑️ Deleting ${filesToDelete.length} old backup files...`)
        
        for (const file of filesToDelete) {
          try {
            console.log(`   🗑️ Removing old backup (${file.size})...`)
            const deleteCommand = `s3cmd del "${file.fullPath}" --config="${s3ConfigFile}"`
            await execAsync(deleteCommand)
            console.log(`   ✅ Old backup removed`)
          } catch (error) {
            console.warn(`   ❌ Failed to remove old backup:`, error instanceof Error ? error.message : 'Unknown error')
          }
        }
        
        console.log(`✅ Cleanup completed. Kept ${Math.min(backupFiles.length, 3)} most recent backups`)
      } else {
        console.log(`✅ No cleanup needed. Only ${backupFiles.length} backup files exist`)
      }

      // Clean up config file
      this.cleanupFiles([s3ConfigFile])

    } catch (error) {
      console.warn('⚠️ Failed to cleanup old backups:', error)
      // Don't throw error - backup was successful, cleanup is just maintenance
    }
  }

  private startProgressMonitoring(filePath: string, startTime: number): NodeJS.Timeout | null {
    try {
      // Monitor file size growth every 30 seconds
      return setInterval(async () => {
        try {
          if (existsSync(filePath)) {
            const { stdout } = await execAsync(`du -h "${filePath}"`)
            const currentSize = stdout.split('\t')[0]
            const elapsed = Math.round((Date.now() - startTime) / 1000)
            const elapsedMin = Math.floor(elapsed / 60)
            const elapsedSec = elapsed % 60
            
            console.log(`📊 Progress: ${currentSize} dumped (${elapsedMin}m ${elapsedSec}s elapsed)`)
            
            // Estimate progress based on typical compression ratios for media databases
            // Rough estimate: 107GB database -> ~25-35GB compressed dump
            const sizeMatch = currentSize.match(/^([\d.]+)([KMGT]?)/)
            if (sizeMatch) {
              const value = parseFloat(sizeMatch[1])
              const unit = sizeMatch[2] || ''
              let sizeInGB = value
              
              if (unit === 'M') sizeInGB = value / 1024
              else if (unit === 'K') sizeInGB = value / (1024 * 1024)
              else if (unit === 'T') sizeInGB = value * 1024
              
              // Estimate completion based on 30GB target (conservative estimate)
              const estimatedFinalSize = 30
              const progressPercent = Math.min(Math.round((sizeInGB / estimatedFinalSize) * 100), 99)
              
              if (sizeInGB > 0.1) { // Only show percentage if we have meaningful data
                console.log(`📈 Estimated progress: ~${progressPercent}% (based on ${estimatedFinalSize}GB target)`)
              }
            }
          }
        } catch {
          // Silently continue if file doesn't exist yet or other monitoring errors
        }
      }, 600000) // Check every 10 minutes
    } catch (error) {
      console.warn('⚠️ Could not start progress monitoring:', error)
      return null
    }
  }
}