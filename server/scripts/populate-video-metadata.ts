#!/usr/bin/env tsx

/**
 * Script to populate video metadata (fps, codec, bitrate, width, height, duration) 
 * for existing video records in the database that don't have these fields populated.
 * 
 * This script uses ffprobe to extract metadata from video files and updates the database.
 * 
 * Usage:
 *   cd malris
 *   yarn tsx server/scripts/populate-video-metadata.ts [--dry-run] [--batch-size=100] [--limit=10]
 */

import { execSync } from 'child_process'
import { join } from 'path'
import { getDb } from '../utils/database'
import { mediaRecords } from '../utils/schema'
import { eq, and, isNull, or } from 'drizzle-orm'
import { decryptMediaData } from '../utils/encryption'

interface VideoMetadata {
  fps?: number
  codec?: string
  bitrate?: number
  width?: number
  height?: number
  duration?: number
}

interface VideoRecord {
  uuid: string
  filename: string
  encryptedData: Buffer | null
  fps: number | null
  codec: string | null
  bitrate: number | null
  width: number | null
  height: number | null
  duration: number | null
}

class VideoMetadataExtractor {
  private tempDir: string

  constructor() {
    this.tempDir = '/tmp/video-metadata-extraction'
    // Create temp directory if it doesn't exist
    try {
      execSync(`mkdir -p ${this.tempDir}`)
    } catch (error) {
      console.error('Failed to create temp directory:', error)
      throw error
    }
  }

  /**
   * Extract video metadata using ffprobe
   */
  async extractVideoMetadata(videoPath: string): Promise<VideoMetadata | null> {
    try {
      console.log(`🎬 Extracting metadata from: ${videoPath}`)

      // Get framerate
      const fps = await this.getVideoFramerate(videoPath)
      
      // Get codec
      const codec = await this.getVideoCodec(videoPath)
      
      // Get dimensions, duration, and bitrate in one call
      const { width, height, duration, bitrate } = await this.getVideoDimensions(videoPath)

      const metadata: VideoMetadata = {
        fps: fps || undefined,
        codec: codec || undefined,
        bitrate: bitrate || undefined,
        width: width || undefined,
        height: height || undefined,
        duration: duration || undefined
      }

      console.log(`✅ Extracted metadata:`, metadata)
      return metadata

    } catch (error) {
      console.error(`❌ Failed to extract metadata from ${videoPath}:`, error)
      return null
    }
  }

  private async getVideoFramerate(videoPath: string): Promise<number | null> {
    try {
      // Try multiple methods to get framerate
      console.log(`🔍 Extracting framerate for: ${videoPath}`)
      
      // Method 1: r_frame_rate
      let result = execSync(`ffprobe -v quiet -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8',
        timeout: 30000
      }).trim()
      
      console.log(`📊 r_frame_rate result: "${result}"`)

      if (result && result !== 'N/A' && result !== '0/0') {
        // Handle fractional framerates like "30000/1001" or "30/1"
        if (result.includes('/')) {
          const [numerator, denominator] = result.split('/')
          const framerate = parseFloat(numerator) / parseFloat(denominator)
          if (framerate > 0) {
            console.log(`✅ Calculated framerate from r_frame_rate: ${framerate}`)
            return Math.round(framerate * 1000) / 1000 // Round to 3 decimal places
          }
        } else {
          const framerate = parseFloat(result)
          if (framerate > 0) {
            console.log(`✅ Direct framerate from r_frame_rate: ${framerate}`)
            return framerate
          }
        }
      }

      // Method 2: avg_frame_rate as fallback
      result = execSync(`ffprobe -v quiet -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8',
        timeout: 30000
      }).trim()
      
      console.log(`📊 avg_frame_rate result: "${result}"`)

      if (result && result !== 'N/A' && result !== '0/0') {
        if (result.includes('/')) {
          const [numerator, denominator] = result.split('/')
          const framerate = parseFloat(numerator) / parseFloat(denominator)
          if (framerate > 0) {
            console.log(`✅ Calculated framerate from avg_frame_rate: ${framerate}`)
            return Math.round(framerate * 1000) / 1000
          }
        } else {
          const framerate = parseFloat(result)
          if (framerate > 0) {
            console.log(`✅ Direct framerate from avg_frame_rate: ${framerate}`)
            return framerate
          }
        }
      }

      // Method 3: Try to get from format info
      result = execSync(`ffprobe -v quiet -show_entries format=duration -show_entries stream=nb_frames -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8',
        timeout: 30000
      }).trim()
      
      console.log(`📊 duration/frames result: "${result}"`)

      console.warn(`⚠️ Could not determine framerate from any method`)
      return null

    } catch (error) {
      console.warn(`⚠️ Could not extract framerate: ${error}`)
      return null
    }
  }

  private async getVideoCodec(videoPath: string): Promise<string | null> {
    try {
      const result = execSync(`ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8',
        timeout: 30000
      }).trim()

      return result || null
    } catch (error) {
      console.warn(`⚠️ Could not extract codec: ${error}`)
      return null
    }
  }

  private async getVideoDimensions(videoPath: string): Promise<{width: number | null, height: number | null, duration: number | null, bitrate: number | null}> {
    try {
      const result = execSync(`ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height,duration,bit_rate -of csv=p=0 "${videoPath}"`, {
        encoding: 'utf8',
        timeout: 30000
      }).trim()

      if (!result) return { width: null, height: null, duration: null, bitrate: null }

      const parts = result.split(',')
      if (parts.length >= 4) {
        return {
          width: parts[0] ? parseInt(parts[0]) : null,
          height: parts[1] ? parseInt(parts[1]) : null,
          duration: parts[2] ? parseFloat(parts[2]) : null,
          bitrate: parts[3] ? parseInt(parts[3]) : null
        }
      }

      return { width: null, height: null, duration: null, bitrate: null }
    } catch (error) {
      console.warn(`⚠️ Could not extract dimensions: ${error}`)
      return { width: null, height: null, duration: null, bitrate: null }
    }
  }

  /**
   * Write video data to a temporary file for processing
   */
  private async writeVideoToTempFile(videoData: Buffer, filename: string): Promise<string> {
    const tempPath = join(this.tempDir, `${Date.now()}_${filename}`)
    
    try {
      const fs = await import('fs/promises')
      await fs.writeFile(tempPath, videoData)
      return tempPath
    } catch (error) {
      console.error(`Failed to write temp file ${tempPath}:`, error)
      throw error
    }
  }

  /**
   * Clean up temporary file
   */
  private async cleanupTempFile(tempPath: string): Promise<void> {
    try {
      const fs = await import('fs/promises')
      await fs.unlink(tempPath)
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${tempPath}:`, error)
    }
  }

  /**
   * Process a video record and extract metadata
   */
  async processVideoRecord(record: VideoRecord, encryptionKey: string): Promise<VideoMetadata | null> {
    let tempPath: string | null = null

    try {
      // Decrypt video data
      let videoData: Buffer

      if (record.encryptedData) {
        console.log(`🔓 Decrypting video data for ${record.filename}`)
        videoData = decryptMediaData(record.encryptedData, encryptionKey)
      } else {
        console.log(`⚠️ No video data found for ${record.filename}`)
        return null
      }

      // Write to temporary file
      tempPath = await this.writeVideoToTempFile(videoData, record.filename)

      // Extract metadata
      const metadata = await this.extractVideoMetadata(tempPath)

      return metadata

    } catch (error) {
      console.error(`❌ Failed to process video record ${record.uuid}:`, error)
      return null
    } finally {
      // Clean up temporary file
      if (tempPath) {
        await this.cleanupTempFile(tempPath)
      }
    }
  }

  /**
   * Clean up temp directory
   */
  cleanup(): void {
    try {
      execSync(`rm -rf ${this.tempDir}`)
    } catch (_error) {
      console.warn('Failed to cleanup temp directory:', _error)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='))
  const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 100
  const limitArg = args.find(arg => arg.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined

  console.log('🚀 Starting video metadata population script')
  console.log(`📊 Batch size: ${batchSize}`)
  console.log(`🔍 Dry run: ${isDryRun ? 'YES' : 'NO'}`)
  if (limit) {
    console.log(`🎯 Limit: ${limit} videos`)
  }

  // Get encryption key
  const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
  if (!encryptionKey) {
    console.error('❌ MEDIA_ENCRYPTION_KEY environment variable is required')
    process.exit(1)
  }

  // Check if ffprobe is available
  try {
    execSync('which ffprobe', { stdio: 'ignore' })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    console.error('❌ ffprobe is not available. Please install ffmpeg.')
    process.exit(1)
  }

  const db = getDb()
  const extractor = new VideoMetadataExtractor()

  try {
    // Find video records that need metadata population
    console.log('🔍 Finding video records that need metadata population...')
    
    const videosNeedingMetadata = await db
      .select({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename,
        encryptedData: mediaRecords.encryptedData,
        fps: mediaRecords.fps,
        codec: mediaRecords.codec,
        bitrate: mediaRecords.bitrate,
        width: mediaRecords.width,
        height: mediaRecords.height,
        duration: mediaRecords.duration
      })
      .from(mediaRecords)
      .where(
        and(
          eq(mediaRecords.type, 'video'),
          or(
            isNull(mediaRecords.fps),
            isNull(mediaRecords.codec),
            isNull(mediaRecords.bitrate),
            isNull(mediaRecords.width),
            isNull(mediaRecords.height),
            isNull(mediaRecords.duration)
          )
        )
      )
      .limit(limit || 1000) // Limit to prevent memory issues

    console.log(`📊 Found ${videosNeedingMetadata.length} video records that need metadata`)

    if (videosNeedingMetadata.length === 0) {
      console.log('✅ All video records already have metadata populated!')
      return
    }

    let processed = 0
    let updated = 0
    let failed = 0

    // Process videos in batches
    for (let i = 0; i < videosNeedingMetadata.length; i += batchSize) {
      const batch = videosNeedingMetadata.slice(i, i + batchSize)
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(videosNeedingMetadata.length / batchSize)} (${batch.length} videos)`)

      for (const record of batch) {
        try {
          console.log(`\n🎬 Processing: ${record.filename} (${record.uuid})`)
          
          // Check if this record already has all metadata
          const hasAllMetadata = record.fps !== null && 
                                record.codec !== null && 
                                record.bitrate !== null && 
                                record.width !== null && 
                                record.height !== null && 
                                record.duration !== null

          if (hasAllMetadata) {
            console.log(`✅ ${record.filename} already has complete metadata, skipping`)
            processed++
            continue
          }

          // Extract metadata
          const metadata = await extractor.processVideoRecord(record, encryptionKey)

          if (metadata) {
            if (!isDryRun) {
              // Update database record
              await db
                .update(mediaRecords)
                .set({
                  fps: metadata.fps ?? record.fps,
                  codec: metadata.codec ?? record.codec,
                  bitrate: metadata.bitrate ?? record.bitrate,
                  width: metadata.width ?? record.width,
                  height: metadata.height ?? record.height,
                  duration: metadata.duration ?? record.duration,
                  updatedAt: new Date()
                })
                .where(eq(mediaRecords.uuid, record.uuid))

              console.log(`✅ Updated metadata for ${record.filename}`)
              updated++
            } else {
              console.log(`✅ [DRY RUN] Would update metadata for ${record.filename}`)
              updated++
            }
          } else {
            console.log(`❌ Failed to extract metadata for ${record.filename}`)
            failed++
          }

          processed++

        } catch (error) {
          console.error(`❌ Error processing ${record.filename}:`, error)
          failed++
          processed++
        }
      }

      // Progress update
      console.log(`\n📊 Progress: ${processed}/${videosNeedingMetadata.length} processed, ${updated} updated, ${failed} failed`)
    }

    console.log('\n🎉 Video metadata population completed!')
    console.log(`📊 Final stats:`)
    console.log(`   - Total processed: ${processed}`)
    console.log(`   - Successfully updated: ${updated}`)
    console.log(`   - Failed: ${failed}`)

    if (isDryRun) {
      console.log('\n🔍 This was a dry run. No database changes were made.')
      console.log('   Run without --dry-run to actually update the database.')
    }

  } catch (error) {
    console.error('❌ Script failed:', error)
    process.exit(1)
  } finally {
    extractor.cleanup()
  }
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n🛑 Script interrupted by user')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Script terminated')
  process.exit(0)
})

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error)
    process.exit(1)
  })
}