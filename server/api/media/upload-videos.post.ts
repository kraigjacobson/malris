import { getDb } from '~/server/utils/database'
import { mediaRecords, categories, mediaRecordCategories } from '~/server/utils/schema'
import { storeMedia } from '~/server/services/hybridMediaStorage'
import { eq, and } from 'drizzle-orm'
import { unlink, mkdir, readFile } from 'fs/promises'
import { createWriteStream } from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '~/server/utils/logger'
import busboy from 'busboy'

const execAsync = promisify(exec)

// Maximum batch size to prevent overwhelming the server
const MAX_BATCH_SIZE = 10
const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB per file

export default defineEventHandler(async (event) => {
  try {
    // Parse multipart form data using streaming approach
    const { videoFiles, uploadCategories, uploadPurpose } = await parseMultipartStream(event)
    
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
          logger.info(`🎬 Processing video ${i + 1}/${videoFiles.length}: ${file.filename}`)

          // Validate file size
          if (file.size > MAX_FILE_SIZE) {
            errors.push({
              filename: file.filename,
              error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
            })
            continue
          }

          // File is already saved to temp path by streaming parser
          const tempVideoPath = file.tempPath

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
            logger.info(`⚠️ Duplicate video skipped: ${baseFilename} (${metadata.width}x${metadata.height})`)
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

          // Store thumbnail using hybrid storage
          const thumbnailResult = await storeMedia(thumbnailBuffer, {
            filename: `${path.parse(baseFilename).name}_thumb.jpg`,
            type: 'image',
            purpose: 'thumbnail'
          })

          // Read video file from disk for storage
          const videoBuffer = await readFile(tempVideoPath)
          
          // Store video using hybrid storage
          const videoResult = await storeMedia(videoBuffer, {
            filename: baseFilename,
            type: 'video',
            purpose: uploadPurpose
          })

          const thumbnailUuid = thumbnailResult.uuid
          const videoUuid = videoResult.uuid

          // Update the video record with additional metadata using direct database query
          // since storeMedia doesn't handle all the custom fields we need
          // NOTE: Don't overwrite the metadata field - it contains encryption chunk metadata!
          await db
            .update(mediaRecords)
            .set({
              width: metadata.width,
              height: metadata.height,
              duration: metadata.duration,
              tags: {
                codec: metadata.codec,
                format: metadata.format,
                bitrate: metadata.bitrate,
                fps: metadata.fps,
                container: metadata.container
              },
              thumbnailUuid: thumbnailUuid,
              tagsConfirmed: false
            })
            .where(eq(mediaRecords.uuid, videoUuid))

          // Update the thumbnail record with dimensions
          await db
            .update(mediaRecords)
            .set({
              width: 320,
              height: Math.round((320 * metadata.height) / metadata.width),
              tags: {
                generated_from: baseFilename,
                thumbnail_type: 'video_frame'
              },
              tagsConfirmed: false
            })
            .where(eq(mediaRecords.uuid, thumbnailUuid))

          // Handle categories if provided
          if (uploadCategories.length > 0) {
            // Get or create categories
            const categoryIds = []
            
            for (const categoryName of uploadCategories) {
              // Check if category exists
              const existingCategory = await db
                .select()
                .from(categories)
                .where(eq(categories.name, categoryName.toLowerCase()))
                .limit(1)
              
              let categoryId
              if (existingCategory.length > 0) {
                categoryId = existingCategory[0].id
              } else {
                // Create new category
                const newCategory = await db
                  .insert(categories)
                  .values({
                    name: categoryName.toLowerCase(),
                    color: '#98D8C8' // Default color
                  })
                  .returning({ id: categories.id })
                
                categoryId = newCategory[0].id
              }
              
              categoryIds.push(categoryId)
            }
            
            // Create media-category relationships
            if (categoryIds.length > 0) {
              await db
                .insert(mediaRecordCategories)
                .values(
                  categoryIds.map(categoryId => ({
                    mediaRecordUuid: videoUuid,
                    categoryId: categoryId
                  }))
                )
            }
          }

          results.push({
            filename: baseFilename,
            video_uuid: videoUuid,
            thumbnail_uuid: thumbnailUuid,
            metadata: metadata
          })

          logger.info(`✅ Successfully processed: ${baseFilename}`)

          // Clean up temp file
          await unlink(tempVideoPath)

        } catch (error) {
          logger.error(`❌ Error processing ${file.filename}:`, error)
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
        logger.warn('Failed to clean up temp directory:', cleanupError)
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
    logger.error('Video upload error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || `Failed to upload videos: ${error.message || 'Unknown error'}`
    })
  }
})

/**
 * Parse multipart form data using streaming approach to handle large files
 */
async function parseMultipartStream(event: any): Promise<{
  videoFiles: Array<{ filename: string; tempPath: string; size: number; type: string }>
  uploadCategories: string[]
  uploadPurpose: string
}> {
  return new Promise((resolve, reject) => {
    const videoFiles: Array<{ filename: string; tempPath: string; size: number; type: string }> = []
    let uploadCategories: string[] = []
    let uploadPurpose = 'dest'
    
    const tempDir = path.join(os.tmpdir(), `video-upload-stream-${Date.now()}`)
    
    // Create temp directory
    mkdir(tempDir, { recursive: true }).then(() => {
      const bb = busboy({
        headers: event.node.req.headers,
        limits: {
          fileSize: MAX_FILE_SIZE,
          files: MAX_BATCH_SIZE
        }
      })
      
      bb.on('file', (name, file, info) => {
        const { filename, mimeType } = info
        
        if (name === 'videos' && filename && mimeType?.startsWith('video/')) {
          const tempPath = path.join(tempDir, `${Date.now()}_${filename}`)
          const writeStream = createWriteStream(tempPath)
          let fileSize = 0
          
          file.on('data', (chunk) => {
            fileSize += chunk.length
            if (fileSize > MAX_FILE_SIZE) {
              file.destroy()
              writeStream.destroy()
              unlink(tempPath).catch(() => {}) // Clean up
              return
            }
          })
          
          file.on('end', () => {
            videoFiles.push({
              filename,
              tempPath,
              size: fileSize,
              type: mimeType
            })
          })
          
          file.on('error', (err) => {
            logger.error('File stream error:', err)
            writeStream.destroy()
            unlink(tempPath).catch(() => {}) // Clean up
          })
          
          file.pipe(writeStream)
        } else {
          // Skip non-video files
          file.resume()
        }
      })
      
      bb.on('field', (name, value) => {
        if (name === 'categories') {
          try {
            uploadCategories = JSON.parse(value)
          } catch (e) {
            logger.warn('Failed to parse categories:', e)
          }
        } else if (name === 'purpose') {
          uploadPurpose = value
        }
      })
      
      bb.on('close', () => {
        resolve({ videoFiles, uploadCategories, uploadPurpose })
      })
      
      bb.on('error', (err) => {
        logger.error('Busboy error:', err)
        reject(err)
      })
      
      // Pipe the request to busboy
      event.node.req.pipe(bb)
    }).catch(reject)
  })
}

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