/**
 * Queue a single media item for AI tagging
 *
 * Extracts a frame 10% into the video (or uses the image directly for images)
 * and sends it to ComfyUI for WD14 tagging.
 *
 * Creates a job record in the jobs table and uses the standard job callback system.
 */
import { eq } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { mediaRecords, jobs } from '~/server/utils/schema'
import { logger } from '~/server/utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

const execAsync = promisify(exec)

interface QueueTaggingResponse {
  success: boolean
  message: string
  jobId?: string
}

export default defineEventHandler(async (event): Promise<QueueTaggingResponse> => {
  const uuid = getRouterParam(event, 'uuid')

  if (!uuid) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Media UUID is required'
    })
  }

  try {
    const db = getDb()

    // Get the media record
    const [mediaRecord] = await db
      .select()
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)

    if (!mediaRecord) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Media record not found'
      })
    }

    // Check if already tagged
    if (mediaRecord.tags && Object.keys(mediaRecord.tags).length > 0) {
      const tags = (mediaRecord.tags as { tags?: string[] })?.tags
      if (tags && tags.length > 0) {
        return {
          success: false,
          message: `Media already has ${tags.length} tags. Clear tags first to re-tag.`
        }
      }
    }

    // Need a subject UUID for the job - get it from the media record or find one
    let subjectUuid = mediaRecord.subjectUuid
    if (!subjectUuid) {
      // If media has no subject, we need to find or create one
      // For now, just use the first available subject
      const { subjects } = await import('~/server/utils/schema')
      const [firstSubject] = await db.select({ id: subjects.id }).from(subjects).limit(1)
      if (!firstSubject) {
        throw createError({
          statusCode: 400,
          statusMessage: 'No subjects found - cannot create tagging job'
        })
      }
      subjectUuid = firstSubject.id
    }

    logger.info(`🏷️ Queueing tagging job for media ${uuid} (${mediaRecord.type})`)

    let imageBase64: string

    if (mediaRecord.type === 'video') {
      // For videos, extract a frame 10% into the video
      imageBase64 = await extractVideoFrame(uuid)
    } else if (mediaRecord.type === 'image') {
      // For images, use the image directly
      imageBase64 = await getImageBase64(uuid)
    } else {
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported media type: ${mediaRecord.type}`
      })
    }

    // Create a job record in the jobs table
    const jobId = randomUUID()
    await db.insert(jobs).values({
      id: jobId,
      jobType: 'tagging',
      status: 'queued',
      subjectUuid: subjectUuid,
      destMediaUuid: uuid, // The media we're tagging
      parameters: {
        threshold: 0.35,
        character_threshold: 0.85
      },
      createdAt: new Date(),
      updatedAt: new Date()
    })

    logger.info(`📝 Created tagging job record: ${jobId}`)

    // Send to ComfyUI worker for tagging
    await sendToComfyUIForTagging(jobId, uuid, imageBase64)

    logger.info(`✅ Tagging job queued successfully for ${uuid}, job ID: ${jobId}`)

    return {
      success: true,
      message: `Tagging job queued for ${mediaRecord.filename}`,
      jobId
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`❌ Failed to queue tagging job for ${uuid}:`, error)

    if ((error as { statusCode?: number })?.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to queue tagging job: ${errorMessage}`
    })
  }
})

/**
 * Extract a frame 10% into the video as base64
 */
async function extractVideoFrame(uuid: string): Promise<string> {
  const { retrieveMedia } = await import('~/server/services/hybridMediaStorage')

  // Retrieve decrypted video using hybrid storage service
  const decryptedVideo = await retrieveMedia(uuid)

  if (!decryptedVideo) {
    throw new Error(`Failed to retrieve video data for ${uuid}`)
  }

  // Create temp files
  const tempVideoPath = join(tmpdir(), `tag_video_${uuid}.mp4`)
  const tempFramePath = join(tmpdir(), `tag_frame_${uuid}.jpg`)

  try {
    // Write video to temp file
    await writeFile(tempVideoPath, decryptedVideo)

    // Get video duration using ffprobe
    const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempVideoPath}"`
    const { stdout: durationStr } = await execAsync(ffprobeCmd)
    const duration = parseFloat(durationStr.trim())

    // Calculate timestamp at 10% into the video
    const seekTime = duration * 0.1
    const formattedTime = formatSeekTime(seekTime)

    logger.info(`📹 Extracting frame at ${formattedTime} (10% of ${duration.toFixed(2)}s)`)

    // Extract frame using ffmpeg
    // Use -ss before -i for fast seeking, output at reasonable quality
    const ffmpegCmd = `ffmpeg -ss ${formattedTime} -i "${tempVideoPath}" -vframes 1 -q:v 2 -y "${tempFramePath}"`
    await execAsync(ffmpegCmd)

    // Read the frame and convert to base64
    const frameBuffer = await readFile(tempFramePath)
    return frameBuffer.toString('base64')
  } finally {
    // Cleanup temp files
    try {
      await unlink(tempVideoPath)
    } catch { /* ignore */ }
    try {
      await unlink(tempFramePath)
    } catch { /* ignore */ }
  }
}

/**
 * Get image as base64
 */
async function getImageBase64(uuid: string): Promise<string> {
  const { retrieveMedia } = await import('~/server/services/hybridMediaStorage')

  // Retrieve decrypted image using hybrid storage service
  const decryptedImage = await retrieveMedia(uuid)

  if (!decryptedImage) {
    throw new Error(`Failed to retrieve image data for ${uuid}`)
  }

  return decryptedImage.toString('base64')
}

/**
 * Format seek time for ffmpeg (HH:MM:SS.mmm)
 */
function formatSeekTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`
}

/**
 * Send the image to ComfyUI worker for tagging
 */
async function sendToComfyUIForTagging(jobId: string, mediaUuid: string, imageBase64: string): Promise<void> {
  const comfyUIUrl = process.env.COMFYUI_WORKER_URL || 'http://comfyui-runpod-worker:8000'

  // Prepare form data for the tagging workflow
  const formData = new FormData()
  formData.append('job_id', jobId)
  formData.append('job_type', 'tagging')
  formData.append('workflow_type', 'tagging')

  // Send as base64_image (expected by rp_handler.py for tagging workflow)
  formData.append('base64_image', imageBase64)
  formData.append('media_uuid', mediaUuid)

  formData.append('threshold', '0.35')
  formData.append('character_threshold', '0.85')
  formData.append('exclude_tags', '')

  logger.info(`🚀 Sending tagging request to ${comfyUIUrl}/process for job ${jobId}`)

  const response = await fetch(`${comfyUIUrl}/process`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ComfyUI worker returned ${response.status}: ${errorText}`)
  }

  const result = await response.json()
  logger.info(`✅ ComfyUI accepted tagging job: ${JSON.stringify(result)}`)
}
