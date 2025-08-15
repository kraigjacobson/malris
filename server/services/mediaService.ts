/**
 * Media Service - Internal service for media file operations
 * This service contains the actual business logic that can be used by both API endpoints and internal functions
 * Updated to use hybrid storage (BYTEA + Large Objects) with chunk-based encryption for streaming
 */
import { logger } from '~/server/utils/logger'
import { retrieveMedia, getMediaInfo } from './hybridMediaStorage'

export interface MediaFileData {
  buffer: Buffer
  filename: string
  contentType: string
  type: string
}

export async function getMediaFileData(uuid: string): Promise<MediaFileData | null> {
  try {
    // Get media info first to determine content type
    const mediaInfo = await getMediaInfo(uuid)
    if (!mediaInfo) {
      return null
    }
    
    // Retrieve the actual media data using hybrid storage
    // This handles both BYTEA and Large Object storage with encryption/decryption
    const fileData = await retrieveMedia(uuid)
    if (!fileData) {
      return null
    }
    
    // Determine content type
    const filename = mediaInfo.filename.toLowerCase()
    let contentType = "application/octet-stream"
    
    if (mediaInfo.type === "image") {
      if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
        contentType = "image/jpeg"
      } else if (filename.endsWith('.png')) {
        contentType = "image/png"
      } else if (filename.endsWith('.webp')) {
        contentType = "image/webp"
      } else if (filename.endsWith('.gif')) {
        contentType = "image/gif"
      } else {
        contentType = "image/jpeg" // Default for images
      }
    } else if (mediaInfo.type === "video") {
      if (filename.endsWith('.mp4')) {
        contentType = "video/mp4"
      } else if (filename.endsWith('.avi')) {
        contentType = "video/x-msvideo"
      } else if (filename.endsWith('.mov')) {
        contentType = "video/quicktime"
      } else if (filename.endsWith('.webm')) {
        contentType = "video/webm"
      } else {
        contentType = "video/mp4" // Default for videos
      }
    }
    
    return {
      buffer: fileData,
      filename: mediaInfo.filename,
      contentType,
      type: mediaInfo.type
    }
    
  } catch (error: any) {
    logger.error(`Failed to get media file data for ${uuid}:`, error)
    return null
  }
}