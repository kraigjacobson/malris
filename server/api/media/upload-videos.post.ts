import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { encryptMediaData } from '~/server/utils/encryption'
import { createHash } from 'crypto'
import { eq, and } from 'drizzle-orm'
import { writeFile, unlink, mkdir } from 'fs/promises'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Maximum batch size to prevent overwhelming the server
const MAX_BATCH_SIZE = 10
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB per file

export default defineEventHandler(async (event) => {
  try {
    const formData = await readMultipartFormData(event)
    
    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No files provided'
      })
    }

    // Filter video files and validate batch size
    const videoFiles = formData.filter(file => 
      file.name === 'videos' && 
      file.filename && 
      file.data &&
      file.type?.startsWith('video/')
    )

    if (videoFiles.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No video files found in upload'
      })
    }

    if (videoFiles.length > MAX_BATCH_SIZE) {
      throw createError({
        statusCode: 400,
        statusMessage: `Batch size too large. Maximum ${MAX_BATCH_SIZE} videos per batch.`
      })
    }

    const db = getDb()
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
    
    if (!encryptionKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media encryption key not configured'
      })
    }

    const results = []
    const errors = []

    // Create temp directory for processing
    const tempDir = path.join(os.tmpdir(), `video-upload-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })

    try {
      // Process each video file
      for (let i = 0; i < videoFiles.length; i++) {
        const file = videoFiles[i]
        
        try {
          console.log(`🎬 Processing video ${i + 1}/${videoFiles.length}: ${file.filename}`)

          // Validate file size
          if (file.data.length > MAX_FILE_SIZE) {
            errors.push({
              filename: file.filename,
              error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
            })
            continue
          }

          // Create temporary file for ffmpeg processing
          const tempVideoPath = path.join(tempDir, `video_${i}_${Date.now()}.tmp`)
          await writeFile(tempVideoPath, file.data)

          // Get video metadata using ffmpeg
          const metadata = await getVideoMetadata(tempVideoPath)
          
          // Strip path from filename for storage and comparison
          const baseFilename = path.basename(file.filename!)
          
          // Check for duplicates based on dimensions and filename (basename only)
          const existingVideo = await db
            .select()
            .from(mediaRecords)
            .where(and(
              eq(mediaRecords.filename, baseFilename),
              eq(mediaRecords.width, metadata.width),
              eq(mediaRecords.height, metadata.height),
              eq(mediaRecords.purpose, 'dest'),
              eq(mediaRecords.type, 'video')
            ))
            .limit(1)

          if (existingVideo.length > 0) {
            console.log(`⚠️ Duplicate video skipped: ${baseFilename} (${metadata.width}x${metadata.height})`)
            results.push({
              filename: baseFilename,
              success: true,
              message: 'Duplicate video skipped',
              uuid: existingVideo[0].uuid
            })
            await unlink(tempVideoPath)
            continue
          }

          // Generate thumbnail
          const thumbnailBuffer = await generateThumbnail(tempVideoPath)
          
          // Calculate checksums
          const videoChecksum = createHash('sha256').update(file.data).digest('hex')
          const thumbnailChecksum = createHash('sha256').update(thumbnailBuffer).digest('hex')

          // Encrypt video data
          const encryptedVideoData = encryptMediaData(file.data, encryptionKey)
          const encryptedThumbnailData = encryptMediaData(thumbnailBuffer, encryptionKey)

          // Create thumbnail media record first
          const thumbnailRecord = await db
            .insert(mediaRecords)
            .values({
              filename: `${path.parse(baseFilename).name}_thumb.jpg`,
              type: 'image',
              purpose: 'thumbnail',
              fileSize: thumbnailBuffer.length,
              originalSize: thumbnailBuffer.length,
              width: 320, // Standard thumbnail width
              height: Math.round((320 * metadata.height) / metadata.width),
              metadata: {
                generated_from: baseFilename,
                thumbnail_type: 'video_frame'
              },
              encryptedData: encryptedThumbnailData,
              checksum: thumbnailChecksum,
              tagsConfirmed: false
            })
            .returning({ uuid: mediaRecords.uuid })

          const thumbnailUuid = thumbnailRecord[0].uuid

          // Create video media record
          const videoRecord = await db
            .insert(mediaRecords)
            .values({
              filename: baseFilename,
              type: 'video',
              purpose: 'dest',
              fileSize: file.data.length,
              originalSize: file.data.length,
              width: metadata.width,
              height: metadata.height,
              duration: metadata.duration,
              metadata: {
                codec: metadata.codec,
                format: metadata.format,
                bitrate: metadata.bitrate,
                fps: metadata.fps,
                container: metadata.container
              },
              thumbnailUuid: thumbnailUuid,
              encryptedData: encryptedVideoData,
              checksum: videoChecksum,
              tagsConfirmed: false
            })
            .returning({ uuid: mediaRecords.uuid })

          results.push({
            filename: baseFilename,
            video_uuid: videoRecord[0].uuid,
            thumbnail_uuid: thumbnailUuid,
            metadata: metadata
          })

          console.log(`✅ Successfully processed: ${baseFilename}`)

          // Clean up temp file
          await unlink(tempVideoPath)

        } catch (error) {
          console.error(`❌ Error processing ${file.filename}:`, error)
          errors.push({
            filename: path.basename(file.filename!),
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

    } finally {
      // Clean up temp directory
      try {
        const { rm } = await import('fs/promises')
        await rm(tempDir, { recursive: true, force: true })
      } catch (cleanupError) {
        console.warn('Failed to clean up temp directory:', cleanupError)
      }
    }

    return {
      success: true,
      processed: results.length,
      total: videoFiles.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    }

  } catch (error: any) {
    console.error('Video upload error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || `Failed to upload videos: ${error.message || 'Unknown error'}`
    })
  }
})

// Helper function to get video metadata using ffprobe command
async function getVideoMetadata(videoPath: string): Promise<any> {
  try {
    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`)
    const metadata = JSON.parse(stdout)
    
    const videoStream = metadata.streams.find((stream: any) => stream.codec_type === 'video')
    if (!videoStream) {
      throw new Error('No video stream found')
    }

    return {
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      duration: parseFloat(metadata.format.duration) || 0,
      codec: videoStream.codec_name || 'unknown',
      format: metadata.format.format_name || 'unknown',
      bitrate: parseInt(metadata.format.bit_rate) || 0,
      fps: videoStream.r_frame_rate ? eval(videoStream.r_frame_rate) : 0,
      container: path.extname(videoPath).toLowerCase().slice(1)
    }
  } catch (error) {
    throw new Error(`Failed to get video metadata: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Helper function to generate thumbnail using ffmpeg command
async function generateThumbnail(videoPath: string): Promise<Buffer> {
  const tempThumbnailPath = `${videoPath}_thumb.jpg`
  
  try {
    // Generate thumbnail at 10% of video duration, 320px width
    await execAsync(`ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -vf "scale=320:-1" "${tempThumbnailPath}"`)
    
    const fs = await import('fs/promises')
    const thumbnailBuffer = await fs.readFile(tempThumbnailPath)
    await fs.unlink(tempThumbnailPath) // Clean up
    
    return thumbnailBuffer
  } catch (error) {
    // Clean up temp file if it exists
    try {
      const fs = await import('fs/promises')
      await fs.unlink(tempThumbnailPath)
    } catch {
      // Ignore cleanup errors
    }
    
    throw new Error(`Failed to generate thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}