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
    const { mediaFiles, uploadCategories, uploadPurpose } = await parseMultipartStream(event)
    
    if (mediaFiles.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No media files found in upload'
      })
    }

    if (mediaFiles.length > MAX_BATCH_SIZE) {
      throw createError({
        statusCode: 400,
        statusMessage: `Batch size too large. Maximum ${MAX_BATCH_SIZE} files per batch.`
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
    const tempDir = path.join(os.tmpdir(), `media-upload-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })

    try {
      // Process each media file
      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i]
        
        try {
          const fileType = file.type.startsWith('video/') ? 'video' : 'image'
          const emoji = fileType === 'video' ? '🎬' : '🖼️'
          logger.info(`${emoji} Processing ${fileType} ${i + 1}/${mediaFiles.length}: ${file.filename}`)

          // Validate file size
          if (file.size > MAX_FILE_SIZE) {
            errors.push({
              filename: file.filename,
              error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
            })
            continue
          }

          // File is already saved to temp path by streaming parser
          const tempFilePath = file.tempPath

          // Get metadata based on file type
          let metadata
          if (fileType === 'video') {
            metadata = await getVideoMetadata(tempFilePath)
          } else {
            metadata = await getImageMetadata(tempFilePath)
          }
          
          // Strip path from filename for storage and comparison
          const baseFilename = path.basename(file.filename!)
          
          // Check for duplicates based on dimensions and filename (basename only)
          const existingMedia = await db
            .select()
            .from(mediaRecords)
            .where(and(
              eq(mediaRecords.filename, baseFilename),
              eq(mediaRecords.width, metadata.width),
              eq(mediaRecords.height, metadata.height),
              eq(mediaRecords.type, fileType)
            ))
            .limit(1)

          if (existingMedia.length > 0) {
            const existing = existingMedia[0]
            
            // If the existing media has a different purpose, update it to the new purpose
            if (existing.purpose !== uploadPurpose) {
              logger.info(`🔄 Updating ${fileType} purpose: ${baseFilename} (${existing.purpose} → ${uploadPurpose})`)
              
              await db
                .update(mediaRecords)
                .set({
                  purpose: uploadPurpose,
                  updatedAt: new Date()
                })
                .where(eq(mediaRecords.uuid, existing.uuid))
              
              results.push({
                filename: baseFilename,
                success: true,
                message: `${fileType} purpose updated from ${existing.purpose} to ${uploadPurpose}`,
                media_uuid: existing.uuid,
                thumbnail_uuid: existing.thumbnailUuid,
                type: fileType,
                metadata: metadata
              })
            } else {
              // Same purpose, truly a duplicate
              logger.info(`⚠️ Duplicate ${fileType} skipped: ${baseFilename} (${metadata.width}x${metadata.height})`)
              results.push({
                filename: baseFilename,
                success: true,
                message: `Duplicate ${fileType} skipped`,
                media_uuid: existing.uuid,
                thumbnail_uuid: existing.thumbnailUuid,
                type: fileType,
                metadata: metadata
              })
            }
            
            await unlink(tempFilePath)
            continue
          }

          // Generate thumbnail
          let thumbnailBuffer
          if (fileType === 'video') {
            thumbnailBuffer = await generateVideoThumbnail(tempFilePath)
          } else {
            thumbnailBuffer = await generateImageThumbnail(tempFilePath)
          }

          // Store thumbnail using hybrid storage
          const thumbnailResult = await storeMedia(thumbnailBuffer, {
            filename: `${path.parse(baseFilename).name}_thumb.jpg`,
            type: 'image',
            purpose: 'thumbnail'
          })

          // Read media file from disk for storage
          const mediaBuffer = await readFile(tempFilePath)
          
          // Store media using hybrid storage
          const mediaResult = await storeMedia(mediaBuffer, {
            filename: baseFilename,
            type: fileType,
            purpose: uploadPurpose
          })

          const thumbnailUuid = thumbnailResult.uuid
          const mediaUuid = mediaResult.uuid

          // Update the media record with additional metadata using direct database query
          // since storeMedia doesn't handle all the custom fields we need
          const updateData: any = {
            width: metadata.width,
            height: metadata.height,
            thumbnailUuid: thumbnailUuid,
            tagsConfirmed: false
          }

          // Add type-specific metadata
          if (fileType === 'video') {
            updateData.duration = metadata.duration
            updateData.metadata = {
              codec: metadata.codec,
              format: metadata.format,
              bitrate: metadata.bitrate,
              fps: metadata.fps,
              container: metadata.container
            }
          } else {
            updateData.metadata = {
              format: metadata.format,
              colorSpace: metadata.colorSpace,
              hasAlpha: metadata.hasAlpha
            }
          }

          await db
            .update(mediaRecords)
            .set(updateData)
            .where(eq(mediaRecords.uuid, mediaUuid))

          // Update the thumbnail record with dimensions
          await db
            .update(mediaRecords)
            .set({
              width: 320,
              height: Math.round((320 * metadata.height) / metadata.width),
              metadata: {
                generated_from: baseFilename,
                thumbnail_type: fileType === 'video' ? 'video_frame' : 'image_resize'
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
                    mediaRecordUuid: mediaUuid,
                    categoryId: categoryId
                  }))
                )
            }
          }

          results.push({
            filename: baseFilename,
            media_uuid: mediaUuid,
            thumbnail_uuid: thumbnailUuid,
            type: fileType,
            metadata: metadata
          })

          logger.info(`✅ Successfully processed: ${baseFilename}`)

          // Clean up temp file
          await unlink(tempFilePath)

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
      total: mediaFiles.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    }

  } catch (error: any) {
    logger.error('Media upload error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || `Failed to upload media: ${error.message || 'Unknown error'}`
    })
  }
})

/**
 * Parse multipart form data using streaming approach to handle large files
 */
async function parseMultipartStream(event: any): Promise<{
  mediaFiles: Array<{ filename: string; tempPath: string; size: number; type: string }>
  uploadCategories: string[]
  uploadPurpose: string
}> {
  return new Promise((resolve, reject) => {
    const mediaFiles: Array<{ filename: string; tempPath: string; size: number; type: string }> = []
    let uploadCategories: string[] = []
    let uploadPurpose = 'dest'
    
    const tempDir = path.join(os.tmpdir(), `media-upload-stream-${Date.now()}`)
    
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
        
        if (name === 'media' && filename && (mimeType?.startsWith('video/') || mimeType?.startsWith('image/'))) {
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
            mediaFiles.push({
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
          // Skip non-media files
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
        resolve({ mediaFiles, uploadCategories, uploadPurpose })
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

// Helper function to get image metadata using ffprobe command
async function getImageMetadata(imagePath: string): Promise<any> {
  try {
    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_format -show_streams "${imagePath}"`)
    const metadata = JSON.parse(stdout)
    
    const imageStream = metadata.streams.find((stream: any) => stream.codec_type === 'video')
    if (!imageStream) {
      throw new Error('No image stream found')
    }

    return {
      width: imageStream.width || 0,
      height: imageStream.height || 0,
      format: metadata.format.format_name || 'unknown',
      colorSpace: imageStream.color_space || 'unknown',
      hasAlpha: imageStream.pix_fmt?.includes('a') || false
    }
  } catch (error) {
    throw new Error(`Failed to get image metadata: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Helper function to generate video thumbnail using ffmpeg command
async function generateVideoThumbnail(videoPath: string): Promise<Buffer> {
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
    
    throw new Error(`Failed to generate video thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Helper function to generate image thumbnail using ffmpeg command
async function generateImageThumbnail(imagePath: string): Promise<Buffer> {
  const tempThumbnailPath = `${imagePath}_thumb.jpg`
  
  try {
    // Generate thumbnail with 320px width, maintaining aspect ratio
    await execAsync(`ffmpeg -i "${imagePath}" -vf "scale=320:-1" "${tempThumbnailPath}"`)
    
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
    
    throw new Error(`Failed to generate image thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}