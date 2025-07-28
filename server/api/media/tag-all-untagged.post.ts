import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { eq, and, isNull, or } from 'drizzle-orm'

// Global state for tagging queue management
let isTagsProcessing = false
const videoQueue: Array<{ uuid: string; filename: string; decryptedData: Buffer }> = []
let currentBatchInfo = { processed: 0, total: 0, errors: 0 }

export default defineEventHandler(async (event) => {
  try {
    console.log('🏷️ Starting tag-all-untagged process...')
    
    const db = getDb()
    const body = await readBody(event).catch(() => ({}))
    
    // Get batch size from request body, default to 50, min 1, max 1000
    const batchSize = Math.min(Math.max(body.batchSize || 50, 1), 1000)
    console.log(`📦 Processing batch size: ${batchSize}`)
    
    // First check total count of untagged videos
    const totalUntaggedCount = await db
      .select({ count: mediaRecords.uuid })
      .from(mediaRecords)
      .where(
        and(
          eq(mediaRecords.type, 'video'),
          eq(mediaRecords.purpose, 'dest'),
          or(
            isNull(mediaRecords.tags),
            eq(mediaRecords.tags, '{}')
          )
        )
      )
    
    const totalUntagged = totalUntaggedCount.length
    console.log(`📊 Total untagged videos: ${totalUntagged}`)
    
    if (totalUntagged === 0) {
      console.log('✅ No untagged videos found')
      return {
        success: true,
        count: 0,
        totalRemaining: 0,
        hasMore: false,
        message: 'No untagged videos found'
      }
    }
    
    // Get next batch of 10 untagged videos
    const untaggedVideos = await db
      .select({
        uuid: mediaRecords.uuid,
        filename: mediaRecords.filename,
        encryptedData: mediaRecords.encryptedData
      })
      .from(mediaRecords)
      .where(
        and(
          eq(mediaRecords.type, 'video'),
          eq(mediaRecords.purpose, 'dest'),
          or(
            isNull(mediaRecords.tags),
            eq(mediaRecords.tags, '{}')
          )
        )
      )
      .limit(batchSize)
    
    const batchCount = untaggedVideos.length
    const remainingAfterBatch = totalUntagged - batchCount
    const hasMore = remainingAfterBatch > 0
    
    console.log(`🎬 Processing batch of ${batchCount} videos (${remainingAfterBatch} remaining after this batch)`)
    
    // Decrypt video data for processing
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
    if (!encryptionKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media encryption key not configured'
      })
    }
    
    const { decryptMediaData } = await import('~/server/utils/encryption')
    
    const decryptedVideos = untaggedVideos.map(video => {
      try {
        // Handle bytea data - convert to Buffer if needed
        const encryptedBuffer = Buffer.isBuffer(video.encryptedData)
          ? video.encryptedData
          : Buffer.from(video.encryptedData as string, 'hex')
        
        const decryptedData = decryptMediaData(encryptedBuffer, encryptionKey)
        
        return {
          uuid: video.uuid,
          filename: video.filename,
          decryptedData: decryptedData
        }
      } catch (error) {
        console.error(`❌ Error decrypting video ${video.uuid}:`, error)
        return null
      }
    }).filter(video => video !== null)
    
    console.log(`🔓 Successfully decrypted ${decryptedVideos.length} videos`)
    
    // Add videos to queue and start processing
    addVideosToQueue(decryptedVideos)
    
    // Return immediately with batch info
    return {
      success: true,
      count: batchCount,
      totalRemaining: remainingAfterBatch,
      hasMore: hasMore,
      message: `Started tagging process for ${batchCount} videos. ${remainingAfterBatch} videos remaining.`
    }
    
  } catch (error: any) {
    console.error('❌ Error in tag-all-untagged:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to start tagging process'
    })
  }
})

/**
 * Add videos to the processing queue
 */
function addVideosToQueue(videos: any[]) {
  console.log(`📥 Adding ${videos.length} videos to processing queue`)
  
  // Add videos to queue
  videoQueue.push(...videos)
  currentBatchInfo.total += videos.length
  
  console.log(`📊 Queue status: ${videoQueue.length} videos waiting, ${currentBatchInfo.processed} processed, ${currentBatchInfo.errors} errors`)
  
  // Start processing if not already running
  if (!isTagsProcessing && videoQueue.length > 0) {
    processNextVideoInQueue()
  }
}

/**
 * Process the next video in the queue
 */
async function processNextVideoInQueue() {
  if (isTagsProcessing || videoQueue.length === 0) {
    console.log(`⏸️ Queue processing paused: isProcessing=${isTagsProcessing}, queueLength=${videoQueue.length}`)
    return
  }
  
  const video = videoQueue.shift()
  if (!video) return
  
  isTagsProcessing = true
  console.log(`🏷️ Processing video ${currentBatchInfo.processed + 1}/${currentBatchInfo.total}: ${video.uuid}`)
  
  try {
    // Extract frame from video for tagging
    const frameData = await extractVideoFrame(video.decryptedData, video.uuid)
    
    if (!frameData) {
      console.warn(`⚠️ Could not extract frame from video: ${video.uuid}`)
      currentBatchInfo.errors++
      isTagsProcessing = false
      // Continue with next video
      processNextVideoInQueue()
      return
    }
    
    // Send to ComfyUI for tagging - this will set isTagsProcessing to false when results come back
    const success = await sendToComfyUIForTagging(frameData, video.uuid)
    
    if (!success) {
      console.warn(`⚠️ Failed to submit video ${video.uuid} for tagging`)
      currentBatchInfo.errors++
      isTagsProcessing = false
      // Continue with next video
      processNextVideoInQueue()
    }
    // If success, we wait for the tagging-results callback to continue
    
  } catch (error: any) {
    console.error(`❌ Error processing video ${video.uuid}:`, error)
    currentBatchInfo.errors++
    isTagsProcessing = false
    // Continue with next video
    processNextVideoInQueue()
  }
}

/**
 * Called when tagging results are received to continue processing
 */
export function onTaggingComplete() {
  currentBatchInfo.processed++
  isTagsProcessing = false
  
  console.log(`✅ Tagging completed. Progress: ${currentBatchInfo.processed}/${currentBatchInfo.total}, ${currentBatchInfo.errors} errors, ${videoQueue.length} remaining`)
  
  // Process next video in queue
  if (videoQueue.length > 0) {
    setTimeout(() => processNextVideoInQueue(), 1000) // Small delay to be gentle
  } else {
    console.log(`🎉 All videos in batch completed! Final stats: ${currentBatchInfo.processed} processed, ${currentBatchInfo.errors} errors`)
    // Reset batch info for next batch
    currentBatchInfo = { processed: 0, total: 0, errors: 0 }
  }
}

/**
 * Get current queue status for UI display
 */
export function getQueueStatus() {
  return {
    queueLength: videoQueue.length,
    isProcessing: isTagsProcessing,
    currentBatch: {
      processed: currentBatchInfo.processed,
      total: currentBatchInfo.total,
      errors: currentBatchInfo.errors
    }
  }
}

/**
 * Extract a frame from decrypted video data for tagging analysis
 */
async function extractVideoFrame(decryptedVideoData: Buffer, videoUuid: string): Promise<string | null> {
  try {
    const fs = await import('fs')
    const os = await import('os')
    const path = await import('path')
    
    // Create temp directory if it doesn't exist
    const tempDir = os.tmpdir()
    const tempVideoPath = path.join(tempDir, `video_${videoUuid}.mp4`)
    
    // Write decrypted video to temporary file
    fs.writeFileSync(tempVideoPath, decryptedVideoData)
    console.log(`📁 Wrote temp video file: ${tempVideoPath} (${decryptedVideoData.length} bytes)`)
    
    // Verify the video file was written correctly
    if (!fs.existsSync(tempVideoPath)) {
      console.error(`❌ Temp video file was not created: ${tempVideoPath}`)
      return null
    }
    
    // Use ffmpeg to extract a frame - try multiple timestamps
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    
    const tempFramePath = path.join(tempDir, `frame_${videoUuid}.jpg`)
    
    // Try different timestamps in case the video is shorter than 5 seconds
    const timestamps = ['5', '1', '0.5', '0']
    
    for (const timestamp of timestamps) {
      try {
        console.log(`🎬 Attempting frame extraction at ${timestamp}s for video ${videoUuid}`)
        
        // Extract frame using ffmpeg with size optimization for ComfyUI (512x512 max, higher compression)
        const ffmpegCommand = `ffmpeg -i "${tempVideoPath}" -ss ${timestamp} -vframes 1 -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2" -q:v 8 -y "${tempFramePath}"`
        console.log(`🔧 Running FFmpeg command: ${ffmpegCommand}`)
        
        const { stdout, stderr } = await execAsync(ffmpegCommand)
        
        if (stderr) {
          console.log(`📝 FFmpeg stderr for ${videoUuid}:`, stderr)
        }
        if (stdout) {
          console.log(`📝 FFmpeg stdout for ${videoUuid}:`, stdout)
        }
        
        // Check if the frame file was actually created
        if (!fs.existsSync(tempFramePath)) {
          console.warn(`⚠️ Frame file not created at timestamp ${timestamp}s, trying next timestamp...`)
          continue
        }
        
        // Check if the frame file has content
        const frameStats = fs.statSync(tempFramePath)
        if (frameStats.size === 0) {
          console.warn(`⚠️ Frame file is empty at timestamp ${timestamp}s, trying next timestamp...`)
          fs.unlinkSync(tempFramePath) // Clean up empty file
          continue
        }
        
        console.log(`✅ Successfully extracted frame at ${timestamp}s (${frameStats.size} bytes)`)
        
        // Read the extracted frame and convert to base64
        const frameBuffer = fs.readFileSync(tempFramePath)
        const base64Frame = frameBuffer.toString('base64')
        
        // Clean up temp files
        fs.unlinkSync(tempVideoPath)
        fs.unlinkSync(tempFramePath)
        
        return base64Frame
        
      } catch (ffmpegError: any) {
        console.warn(`⚠️ FFmpeg failed at timestamp ${timestamp}s for video ${videoUuid}:`, ffmpegError.message)
        // Continue to next timestamp
        continue
      }
    }
    
    // If we get here, all timestamps failed
    console.error(`❌ All frame extraction attempts failed for video ${videoUuid}`)
    
    // Clean up temp video file
    try {
      fs.unlinkSync(tempVideoPath)
    } catch {}
    
    return null
    
  } catch (error) {
    console.error(`❌ Error extracting frame from video ${videoUuid}:`, error)
    return null
  }
}

/**
 * Send frame data to ComfyUI for tagging
 */
async function sendToComfyUIForTagging(base64Image: string, videoUuid: string): Promise<boolean> {
  try {
    console.log(`🔥 [COMFYUI-SUBMIT] ===== SENDING TO COMFYUI =====`)
    console.log(`🔥 [COMFYUI-SUBMIT] Video UUID: ${videoUuid}`)
    console.log(`🔥 [COMFYUI-SUBMIT] Base64 image length: ${base64Image.length} chars`)
    
    // Get ComfyUI worker URL from environment
    const comfyUIUrl = process.env.COMFYUI_WORKER_URL || process.env.COMFYUI_URL || 'http://localhost:8001'
    console.log(`🔥 [COMFYUI-SUBMIT] ComfyUI URL: ${comfyUIUrl}`)
    
    // Use a prefixed identifier for tagging to avoid conflicts with job system
    const tagJobId = `tag_${videoUuid}`
    console.log(`🔥 [COMFYUI-SUBMIT] Tag Job ID: ${tagJobId}`)
    
    // Prepare the request data for ComfyUI tagging workflow
    const formData = new FormData()
    formData.append('job_type', 'tagging')
    formData.append('workflow_type', 'tagging')
    formData.append('job_id', tagJobId)
    formData.append('base64_image', base64Image)
    formData.append('threshold', '0.35')
    formData.append('character_threshold', '0.85')
    formData.append('exclude_tags', '')
    formData.append('dest_media_uuid', videoUuid) // Pass the actual video UUID for callback URL
    
    console.log(`🔥 [COMFYUI-SUBMIT] FormData fields:`)
    console.log(`🔥 [COMFYUI-SUBMIT] - job_type: tagging`)
    console.log(`🔥 [COMFYUI-SUBMIT] - workflow_type: tagging`)
    console.log(`🔥 [COMFYUI-SUBMIT] - job_id: ${tagJobId}`)
    console.log(`🔥 [COMFYUI-SUBMIT] - base64_image length: ${base64Image.length} chars`)
    console.log(`🔥 [COMFYUI-SUBMIT] - threshold: 0.35`)
    console.log(`🔥 [COMFYUI-SUBMIT] - character_threshold: 0.85`)
    console.log(`🔥 [COMFYUI-SUBMIT] - exclude_tags: (empty)`)
    console.log(`🔥 [COMFYUI-SUBMIT] - dest_media_uuid: ${videoUuid}`)
    console.log(` Sending tagging request for video ${videoUuid} with job ID: ${tagJobId}`)
    
    // Send request to ComfyUI
    console.log(`🔥 [COMFYUI-SUBMIT] Making POST request to: ${comfyUIUrl}/process`)
    const response = await fetch(`${comfyUIUrl}/process`, {
      method: 'POST',
      body: formData
    })
    
    console.log(`🔥 [COMFYUI-SUBMIT] Response status: ${response.status} ${response.statusText}`)
    console.log(`🔥 [COMFYUI-SUBMIT] Response headers:`, Object.fromEntries(response.headers.entries()))
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ [COMFYUI-SUBMIT] ComfyUI request failed for video ${videoUuid}:`, response.status, response.statusText)
      console.error(`❌ [COMFYUI-SUBMIT] Error response body:`, errorText)
      return false
    }
    
    const result = await response.json()
    console.log(`🔥 [COMFYUI-SUBMIT] ComfyUI response body:`, JSON.stringify(result, null, 2))
    console.log(`✅ [COMFYUI-SUBMIT] ComfyUI accepted tagging job for video ${videoUuid}`)
    
    // ComfyUI will process async and send results back via the tagging-results endpoint
    console.log(`🔥 [COMFYUI-SUBMIT] ComfyUI should send results back to our callback endpoint`)
    return true
    
  } catch (error) {
    console.error(`❌ Error sending video ${videoUuid} to ComfyUI:`, error)
    return false
  }
}