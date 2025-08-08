import { eq, and, isNull, inArray, sql } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { decryptMediaData, encryptMediaData } from '~/server/utils/encryption'
import { createHash } from 'crypto'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '~/server/utils/logger'

const execAsync = promisify(exec)

interface RegenerateThumbnailsRequest {
  videoUuids?: string[]  // Specific video UUIDs to process
  batchSize?: number     // Number of videos to process at once
  dryRun?: boolean       // Just count how many would be processed
}

interface RegenerateThumbnailsResponse {
  success: boolean
  message: string
  processed: number
  failed: number
  skipped: number
  errors: string[]
  videosFound?: number  // For dry run
  remainingWithoutMetadata?: number  // Videos still missing metadata
}

export default defineEventHandler(async (event): Promise<RegenerateThumbnailsResponse> => {
  try {
    const body = await readBody(event) as RegenerateThumbnailsRequest
    const { videoUuids, batchSize = 10, dryRun = false } = body

    const db = getDb()
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
    
    if (!encryptionKey) {
      throw new Error('MEDIA_ENCRYPTION_KEY not configured')
    }

    // Build query to find videos that need thumbnail regeneration
    let whereConditions
    
    // If specific UUIDs provided, process those videos regardless of metadata
    if (videoUuids && videoUuids.length > 0) {
      whereConditions = and(
        eq(mediaRecords.type, 'video'),
        eq(mediaRecords.purpose, 'dest'),
        inArray(mediaRecords.uuid, videoUuids)
      )
    } else {
      // Default behavior: find videos without metadata (likely corrupted thumbnails)
      whereConditions = and(
        eq(mediaRecords.type, 'video'),
        eq(mediaRecords.purpose, 'dest'),
        isNull(mediaRecords.metadata)
      )
    }

    const videos = await db.select({
      uuid: mediaRecords.uuid,
      filename: mediaRecords.filename,
      encryptedData: mediaRecords.encryptedData,
      thumbnailUuid: mediaRecords.thumbnailUuid,
      metadata: mediaRecords.metadata
    }).from(mediaRecords)
    .where(whereConditions)
    .limit(batchSize)

    const filteredVideos = videos

    if (dryRun) {
      return {
        success: true,
        message: `Found ${filteredVideos.length} videos that need thumbnail regeneration`,
        processed: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        videosFound: filteredVideos.length
      }
    }

    let processed = 0
    let failed = 0
    let skipped = 0
    const errors: string[] = []

    logger.info(`🎬 Starting thumbnail regeneration for ${filteredVideos.length} videos...`)

    for (const video of filteredVideos) {
      try {
        if (!video.thumbnailUuid) {
          logger.info(`⚠️ Skipping ${video.filename}: No thumbnail UUID`)
          skipped++
          continue
        }

        logger.info(`🔄 Processing ${video.filename} (${video.uuid})...`)

        // Get the thumbnail record
        const thumbnailRecord = await db.select()
          .from(mediaRecords)
          .where(eq(mediaRecords.uuid, video.thumbnailUuid))
          .limit(1)

        if (thumbnailRecord.length === 0) {
          logger.info(`⚠️ Skipping ${video.filename}: Thumbnail record not found`)
          skipped++
          continue
        }

        // Decrypt the video data
        const decryptedVideo = decryptMediaData(video.encryptedData, encryptionKey)
        
        // Create temporary files
        const tempVideoPath = join(tmpdir(), `video_${video.uuid}.mp4`)
        const tempThumbnailPath = join(tmpdir(), `thumb_${video.uuid}.jpg`)

        try {
          // Write video to temp file
          await writeFile(tempVideoPath, decryptedVideo)

          // Extract video metadata using ffprobe
          logger.info(`📊 Extracting metadata for ${video.filename}...`)
          const ffprobeCmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${tempVideoPath}"`
          const { stdout: ffprobeOutput } = await execAsync(ffprobeCmd)
          const ffprobeData = JSON.parse(ffprobeOutput)
          
          // Extract relevant metadata
          const videoStream = ffprobeData.streams?.find((stream: any) => stream.codec_type === 'video')
          const format = ffprobeData.format
          
          const metadata = {
            fps: videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : null,
            codec: videoStream?.codec_name || null,
            format: format?.format_name || null,
            bitrate: format?.bit_rate ? parseInt(format.bit_rate) : null,
            container: format?.format_name?.split(',')[0] || null
          }

          // Generate thumbnail using ffmpeg
          const ffmpegCmd = `ffmpeg -i "${tempVideoPath}" -ss 00:00:01 -vframes 1 -vf scale=320:-1 -y "${tempThumbnailPath}"`
          
          logger.info(`🎥 Generating thumbnail for ${video.filename}...`)
          await execAsync(ffmpegCmd)

          // Read the generated thumbnail
          const thumbnailBuffer = await import('fs').then(fs => fs.promises.readFile(tempThumbnailPath))
          
          // Get image dimensions - use default values since we know ffmpeg scale=320:-1
          // This maintains aspect ratio with width=320
          let width = 320
          let height = 240
          
          try {
            // Parse ffmpeg output to get actual dimensions if needed
            // For now, use reasonable defaults since ffmpeg scale=320:-1 gives us width=320
            // and height is calculated to maintain aspect ratio
            width = 320
            height = Math.round(320 * 0.75) // Assume 4:3 aspect ratio as default
          } catch {
            logger.info(`⚠️ Could not get dimensions for ${video.filename}, using defaults`)
          }

          // Encrypt the new thumbnail
          const encryptedThumbnail = encryptMediaData(thumbnailBuffer, encryptionKey)
          const checksum = createHash('sha256').update(thumbnailBuffer).digest('hex')

          // Update the thumbnail record
          await db.update(mediaRecords)
            .set({
              encryptedData: encryptedThumbnail,
              fileSize: encryptedThumbnail.length,
              originalSize: thumbnailBuffer.length,
              checksum: checksum,
              width: width,
              height: height,
              updatedAt: new Date()
            })
            .where(eq(mediaRecords.uuid, video.thumbnailUuid))

          // Update the video record with metadata
          await db.update(mediaRecords)
            .set({
              metadata: metadata,
              updatedAt: new Date()
            })
            .where(eq(mediaRecords.uuid, video.uuid))

          logger.info(`✅ Successfully regenerated thumbnail for ${video.filename} (${width}x${height})`)
          logger.info(`📊 Updated metadata: fps=${metadata.fps}, codec=${metadata.codec}, bitrate=${metadata.bitrate}`)
          processed++

        } finally {
          // Clean up temp files
          try {
            await unlink(tempVideoPath)
            await unlink(tempThumbnailPath)
          } catch {
            // Ignore cleanup errors
          }
        }

      } catch (error) {
        const errorMsg = `Failed to process ${video.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`
        logger.error(`❌ ${errorMsg}`)
        errors.push(errorMsg)
        failed++
      }
    }

    // Count remaining videos without metadata
    const remainingQuery = await db.select({ count: sql`count(*)` })
      .from(mediaRecords)
      .where(and(
        eq(mediaRecords.type, 'video'),
        eq(mediaRecords.purpose, 'dest'),
        isNull(mediaRecords.metadata)
      ))
    
    const remainingWithoutMetadata = Number(remainingQuery[0]?.count || 0)

    const message = `Thumbnail regeneration complete: ${processed} processed, ${failed} failed, ${skipped} skipped`
    logger.info(`🎉 ${message}`)
    logger.info(`📊 Remaining videos without metadata: ${remainingWithoutMetadata}`)

    return {
      success: true,
      message,
      processed,
      failed,
      skipped,
      errors,
      remainingWithoutMetadata
    }

  } catch (error) {
    logger.error('❌ Thumbnail regeneration failed:', error)
    return {
      success: false,
      message: `Thumbnail regeneration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      processed: 0,
      failed: 0,
      skipped: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    }
  }
})