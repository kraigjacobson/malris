import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, getDbClient } from '~/server/utils/database'
import { mediaRecords, jobs } from '~/server/utils/schema'
import { retrieveMedia } from '~/server/services/hybridMediaStorage'
import { encryptChunked, getOptimalChunkSize } from '~/server/services/chunkEncryption'
import { exec } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { createHash, randomUUID } from 'crypto'
import { logger } from '~/server/utils/logger'

const execAsync = promisify(exec)

const DEFAULT_THRESHOLD = 100 * 1024 * 1024 // 100MB
const CHUNK_SIZE = 64 * 1024 // 64KB chunks for LOB operations

const editOperationsSchema = z.object({
  operations: z.object({
    trim: z
      .object({
        start: z.number().min(0),
        end: z.number().min(0)
      })
      .optional(),
    crop: z
      .object({
        x: z.number().min(0),
        y: z.number().min(0),
        width: z.number().min(1),
        height: z.number().min(1)
      })
      .optional(),
    deletedFrames: z
      .array(
        z.object({
          time: z.number(),
          frame: z.number()
        })
      )
      .optional()
  })
})

export default defineEventHandler(async event => {
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
    const mediaRecord = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, uuid)).limit(1)

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

      // Get video metadata using ffprobe
      logger.info('Getting video metadata...')
      const ffprobeCommand = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,r_frame_rate,codec_name,bit_rate -of json "${outputTempFile}"`
      const { stdout } = await execAsync(ffprobeCommand)
      const metadata = JSON.parse(stdout)
      const videoStream = metadata.streams[0] || {}

      const newWidth = videoStream.width || media.width
      const newHeight = videoStream.height || media.height
      const newDuration = parseFloat(videoStream.duration) || media.duration
      const newFps = videoStream.r_frame_rate ? eval(videoStream.r_frame_rate) : media.fps
      const newCodec = videoStream.codec_name || media.codec
      const newBitrate = parseInt(videoStream.bit_rate) || media.bitrate

      logger.info(`New video dimensions: ${newWidth}x${newHeight}, duration: ${newDuration}s`)

      // Encrypt the processed video
      const client = await getDbClient()
      const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY || 'default_key'
      const chunkSize = getOptimalChunkSize(processedVideoData.length)
      const encryptionResult = await encryptChunked(processedVideoData, encryptionKey, chunkSize)
      const encryptedData = encryptionResult.encryptedData
      const chunkMetadata = encryptionResult.metadata
      const encryptionMethod = 'aes-gcm-unified'

      const encryptedFileSize = encryptedData.length
      const checksum = createHash('sha256').update(encryptedData).digest('hex')

      logger.info(`Encrypted ${processedVideoData.length} bytes into ${chunkMetadata.totalChunks} chunks of ${chunkMetadata.chunkSize} bytes each`)

      let updatedMediaResult
      try {
        // Update the existing media record with new encrypted data
        const threshold = DEFAULT_THRESHOLD

        if (encryptedFileSize <= threshold) {
          // Update BYTEA storage
          logger.info(`Updating BYTEA storage for ${uuid}`)
          const metadataJson = JSON.stringify(chunkMetadata)

          await client.query(
            `
            UPDATE media_records SET
              encrypted_data = $1,
              file_size = $2,
              original_size = $3,
              checksum = $4,
              encryption_method = $5,
              chunk_size = $6,
              encryption_metadata = $7,
              storage_type = 'bytea',
              width = $8,
              height = $9,
              duration = $10,
              fps = $11,
              codec = $12,
              bitrate = $13,
              updated_at = NOW(),
            tags = $14
            WHERE uuid = $15
          `,
            [
              encryptedData,
              encryptedFileSize,
              encryptedFileSize,
              checksum,
              encryptionMethod,
              chunkMetadata.chunkSize,
              metadataJson,
              newWidth,
              newHeight,
              newDuration,
              newFps,
              newCodec,
              newBitrate,
              {
                ...((media.tags as any) || {}),
                editHistory: [
                  ...((media.tags as any)?.editHistory || []),
                  {
                    timestamp: new Date().toISOString(),
                    operations: validatedData.operations
                  }
                ]
              },
              uuid
            ]
          )

          logger.info(`Updated media ${uuid} using BYTEA (${encryptedFileSize} bytes)`)
        } else {
          // Update Large Object storage
          logger.info(`Updating Large Object storage for ${uuid}`)

          await client.query('BEGIN')

          try {
            // Delete old large object if exists
            if (media.largeObjectOid) {
              logger.info(`Deleting old large object: ${media.largeObjectOid}`)
              await client.query('SELECT lo_unlink($1)', [media.largeObjectOid])
            }

            // Create new large object
            const oidResult = await client.query('SELECT lo_create(0)')
            const oid = oidResult.rows[0].lo_create
            logger.info('Created new large object with OID:', oid)

            // Open for writing
            const fdResult = await client.query('SELECT lo_open($1, 131072)', [oid])
            const fd = fdResult.rows[0].lo_open

            // Write data in chunks
            let offset = 0
            while (offset < encryptedData.length) {
              const chunkEnd = Math.min(offset + CHUNK_SIZE, encryptedData.length)
              const chunk = encryptedData.slice(offset, chunkEnd)
              await client.query('SELECT lowrite($1, $2)', [fd, chunk])
              offset = chunkEnd
            }

            await client.query('SELECT lo_close($1)', [fd])

            // Update media record
            const metadataJson = JSON.stringify(chunkMetadata)

            await client.query(
              `
              UPDATE media_records SET
                large_object_oid = $1,
                encrypted_data = NULL,
                file_size = $2,
                original_size = $3,
                checksum = $4,
                encryption_method = $5,
                chunk_size = $6,
                encryption_metadata = $7,
                storage_type = 'lob',
                size_threshold = $8,
                width = $9,
                height = $10,
                duration = $11,
                fps = $12,
                codec = $13,
                bitrate = $14,
                updated_at = NOW(),
                tags = $15
              WHERE uuid = $16
            `,
              [
                oid,
                encryptedFileSize,
                encryptedFileSize,
                checksum,
                encryptionMethod,
                chunkMetadata.chunkSize,
                metadataJson,
                threshold,
                newWidth,
                newHeight,
                newDuration,
                newFps,
                newCodec,
                newBitrate,
                {
                  ...((media.tags as any) || {}),
                  editHistory: [
                    ...((media.tags as any)?.editHistory || []),
                    {
                      timestamp: new Date().toISOString(),
                      operations: validatedData.operations
                    }
                  ]
                },
                uuid
              ]
            )

            await client.query('COMMIT')
            logger.info(`Updated media ${uuid} using Large Object (${encryptedFileSize} bytes, OID: ${oid})`)
          } catch (error) {
            await client.query('ROLLBACK')
            throw error
          }
        }

        // Regenerate thumbnail from the processed video
        if (media.thumbnailUuid) {
          const tempThumbnailFile = path.join(tempDir, `thumb_${randomUUID()}.jpg`)
          try {
            // If the thumbnail was previously stored as a LOB, unlink it first
            const thumbRecord = await db.select({ largeObjectOid: mediaRecords.largeObjectOid })
              .from(mediaRecords).where(eq(mediaRecords.uuid, media.thumbnailUuid)).limit(1)
            if (thumbRecord[0]?.largeObjectOid) {
              try {
                await client.query('SELECT lo_unlink($1)', [thumbRecord[0].largeObjectOid])
              } catch {}
            }

            const thumbTime = newDuration > 1 ? 1 : newDuration * 0.5
            await execAsync(`ffmpeg -i "${outputTempFile}" -ss ${thumbTime} -vframes 1 -vf scale=320:-1 -y "${tempThumbnailFile}"`)
            const thumbnailBuffer = await fs.readFile(tempThumbnailFile)
            const thumbChunkSize = getOptimalChunkSize(thumbnailBuffer.length)
            const thumbEncResult = await encryptChunked(thumbnailBuffer, encryptionKey, thumbChunkSize)
            const encryptedThumbnail = thumbEncResult.encryptedData
            const thumbChunkMetadata = thumbEncResult.metadata
            await db.update(mediaRecords)
              .set({
                encryptedData: encryptedThumbnail,
                fileSize: encryptedThumbnail.length,
                originalSize: thumbnailBuffer.length,
                checksum: createHash('sha256').update(encryptedThumbnail).digest('hex'),
                encryptionMethod: 'aes-gcm-unified',
                chunkSize: thumbChunkMetadata.chunkSize,
                encryptionMetadata: JSON.stringify(thumbChunkMetadata),
                storageType: 'bytea',
                largeObjectOid: null,
                updatedAt: new Date()
              })
              .where(eq(mediaRecords.uuid, media.thumbnailUuid))
            logger.info(`Regenerated thumbnail for ${uuid}`)
          } catch (thumbError) {
            logger.warn(`Failed to regenerate thumbnail for ${uuid}:`, thumbError)
          } finally {
            try { await fs.unlink(tempThumbnailFile) } catch {}
          }
        }

        // Fetch the updated record
        updatedMediaResult = await db.select().from(mediaRecords).where(eq(mediaRecords.uuid, uuid)).limit(1)

        // Reset related jobs if this is a dest video
        if (media.purpose === 'dest') {
          logger.info(`Resetting jobs related to dest video ${uuid}`)

          // Find all jobs that use this video as dest
          const relatedJobs = await db.select().from(jobs).where(eq(jobs.destMediaUuid, uuid))

          logger.info(`Found ${relatedJobs.length} jobs to reset`)

          for (const job of relatedJobs) {
            // Find and delete output media for this job
            const outputMedia = await db.select().from(mediaRecords).where(eq(mediaRecords.jobId, job.id))

            logger.info(`Found ${outputMedia.length} output media records to delete for job ${job.id}`)

            for (const output of outputMedia) {
              // Delete the large object if it exists
              if (output.largeObjectOid) {
                await client.query('BEGIN')
                try {
                  await client.query('SELECT lo_unlink($1)', [output.largeObjectOid])
                  await client.query('COMMIT')
                  logger.info(`Deleted large object ${output.largeObjectOid} for media ${output.uuid}`)
                } catch (error) {
                  await client.query('ROLLBACK')
                  logger.error(`Failed to delete large object ${output.largeObjectOid}:`, error)
                }
              }

              // Delete the media record
              await db.delete(mediaRecords).where(eq(mediaRecords.uuid, output.uuid))
              logger.info(`Deleted output media ${output.uuid}`)
            }

            // Reset the job: clear source_media_uuid and set status back to queued
            await db
              .update(jobs)
              .set({
                sourceMediaUuid: null,
                status: 'queued',
                progress: 0,
                errorMessage: null,
                startedAt: null,
                completedAt: null,
                updatedAt: new Date()
              })
              .where(eq(jobs.id, job.id))

            logger.info(`Reset job ${job.id} to queued status`)
          }
        }
      } finally {
        client.release()
      }

      logger.info('Video editing completed successfully')

      return {
        success: true,
        message: 'Video edited successfully',
        updatedMedia: updatedMediaResult[0]
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
