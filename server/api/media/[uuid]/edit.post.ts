import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { storeMedia, retrieveMedia } from '~/server/services/hybridMediaStorage'
import { exec } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import { logger } from '~/server/utils/logger'

const execAsync = promisify(exec)

const editOperationsSchema = z.object({
  operations: z.object({
    trim: z.object({
      start: z.number().min(0),
      end: z.number().min(0)
    }).optional(),
    crop: z.object({
      x: z.number().min(0),
      y: z.number().min(0),
      width: z.number().min(1),
      height: z.number().min(1)
    }).optional(),
    deletedFrames: z.array(z.object({
      time: z.number(),
      frame: z.number()
    })).optional()
  })
})

export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, 'uuid')
    
    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'UUID parameter is required'
      })
    }

    // Validate request body
    const body = await readBody(event)
    const validatedData = editOperationsSchema.parse(body)

    const db = getDb()
    
    // Get the media record from database
    const mediaRecord = await db
      .select()
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)

    if (!mediaRecord.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media not found'
      })
    }

    const media = mediaRecord[0]

    // Verify it's a video
    if (media.type !== 'video') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Only video files can be edited'
      })
    }

    // Check if any operations are specified
    const { trim, crop, deletedFrames } = validatedData.operations
    if (!trim && !crop && (!deletedFrames || deletedFrames.length === 0)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No edit operations specified'
      })
    }

    // Retrieve and decrypt the original video data
    logger.info('Retrieving original video data...')
    const originalVideoData = await retrieveMedia(media.uuid)
    
    if (!originalVideoData) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to retrieve original video data'
      })
    }

    // Create temporary files for processing
    const tempDir = path.join(os.tmpdir(), `video-edit-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })
    
    const inputTempFile = path.join(tempDir, `input_${randomUUID()}.mp4`)
    const outputTempFile = path.join(tempDir, `output_${randomUUID()}.mp4`)

    try {
      // Write original video to temporary file
      await fs.writeFile(inputTempFile, originalVideoData)

      // Build FFmpeg command using exec instead of fluent-ffmpeg
      const ffmpegArgs = ['-i', `"${inputTempFile}"`]
      
      // Apply trim operation
      if (trim) {
        ffmpegArgs.push('-ss', trim.start.toString())
        ffmpegArgs.push('-t', (trim.end - trim.start).toString())
      }

      // Apply crop operation
      if (crop) {
        ffmpegArgs.push('-vf', `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`)
      }

      // Apply frame deletion (simplified - removes frames at specific times)
      if (deletedFrames && deletedFrames.length > 0) {
        // For frame deletion, we'll use a select filter to skip frames
        // This is a simplified implementation
        const framesToDelete = deletedFrames.map(f => f.time).sort((a, b) => a - b)
        
        if (framesToDelete.length > 0) {
          // Create a select filter that skips frames at specified times
          const selectFilter = `select='not(between(t,${framesToDelete[0]},${framesToDelete[0] + 0.033}))'`
          if (crop) {
            // Combine with existing crop filter
            ffmpegArgs[ffmpegArgs.indexOf('-vf') + 1] += `,${selectFilter}`
          } else {
            ffmpegArgs.push('-vf', selectFilter)
          }
        }
      }

      // Add output options
      ffmpegArgs.push('-c:v', 'libx264', '-c:a', 'aac', '-preset', 'fast', '-crf', '23')
      ffmpegArgs.push(`"${outputTempFile}"`)

      // Process the video
      logger.info('Processing video with FFmpeg...')
      const ffmpegCommand = `ffmpeg ${ffmpegArgs.join(' ')}`
      logger.info(`Executing: ${ffmpegCommand}`)
      
      await execAsync(ffmpegCommand)
      logger.info('Video processing completed')

      // Read the processed video
      const processedVideoData = await fs.readFile(outputTempFile)
      
      // Get file stats for the new video
      const stats = await fs.stat(outputTempFile)
      const newFileSize = stats.size

      // Store the edited video (encrypted) and update the database
      logger.info('Storing edited video...')
      await storeMedia(processedVideoData, {
        filename: media.filename,
        type: 'video',
        purpose: media.purpose
      })

      // Update database record with new file size and metadata
      const updatedMedia = await db
        .update(mediaRecords)
        .set({
          fileSize: newFileSize,
          originalSize: newFileSize,
          updatedAt: new Date(),
          // Store edit history in tags or a separate field
          tags: {
            ...(media.tags as any || {}),
            editHistory: [
              ...((media.tags as any)?.editHistory || []),
              {
                timestamp: new Date().toISOString(),
                operations: validatedData.operations
              }
            ]
          }
        })
        .where(eq(mediaRecords.uuid, uuid))
        .returning()

      logger.info('Video editing completed successfully')

      return {
        success: true,
        message: 'Video edited successfully',
        updatedMedia: {
          uuid: updatedMedia[0].uuid,
          filename: updatedMedia[0].filename,
          fileSize: updatedMedia[0].fileSize,
          updatedAt: updatedMedia[0].updatedAt,
          tags: updatedMedia[0].tags
        }
      }

    } finally {
      // Clean up temporary files
      try {
        await fs.unlink(inputTempFile)
        await fs.unlink(outputTempFile)
      } catch (cleanupError) {
        console.warn('Failed to clean up temporary files:', cleanupError)
      }
    }

  } catch (error: any) {
    logger.error('Video editing error:', error)
    
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to edit video'
    })
  }
})