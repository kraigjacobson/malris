/**
 * Receive job outputs from comfyui-runpod-worker
 * This endpoint handles the completion of jobs and stores the output media
 */
import path from 'path'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async event => {
  const jobId = getRouterParam(event, 'id')

  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Job ID is required'
    })
  }

  try {
    logger.info(`📥 Receiving outputs for job ${jobId}`)

    const { getDb } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')

    const db = getDb()

    // Verify the job exists in the database
    const existingJob = await db
      .select({
        id: jobs.id,
        status: jobs.status,
        subjectUuid: jobs.subjectUuid,
        destMediaUuid: jobs.destMediaUuid,
        sourceMediaUuid: jobs.sourceMediaUuid // Add this to determine workflow type
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)

    if (existingJob.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }

    const job = existingJob[0]

    // Extract metadata from form data
    let purpose = 'output'
    let errorMessage = null
    let sourceMediaUuid = null
    let jobType = null // Add job_type variable
    let workflowType = null // Add workflow_type variable
    let tagResults = null // For tagging job results
    let mediaUuid = null // The media UUID to update with tags
    const sourceMediaUuids = new Map<string, string>() // Map filename to source UUID
    const videoMetadata = new Map<string, any>() // Map file index to video metadata

    // Check content type - tagging jobs send JSON, file-based jobs send multipart
    const contentType = getHeader(event, 'content-type') || ''
    logger.info(`📥 Content-Type: ${contentType}`)

    let formData: Awaited<ReturnType<typeof readMultipartFormData>> | null = null

    if (contentType.includes('application/json')) {
      // Handle JSON body for tagging jobs
      const body = await readBody(event)
      logger.info(`🏷️ JSON body received: ${JSON.stringify(body)}`)

      jobType = body.job_type
      purpose = body.purpose || 'output'
      tagResults = body.tag_results // Dict mapping media_uuid -> tags
      mediaUuid = body.media_uuid
      errorMessage = body.error_message

      logger.info(`🏷️ Parsed from JSON: jobType=${jobType}, tagResults present=${!!tagResults}, mediaUuid=${mediaUuid}`)
    } else {
      // Parse multipart form data for file-based jobs
      formData = await readMultipartFormData(event)

      if (!formData || formData.length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'No form data received'
        })
      }

      // Debug: Log all fields with their properties
      logger.info(`🔍 FORM DEBUG: Total fields received: ${formData.length}`)
      for (const field of formData) {
        logger.info(`🔍 FORM DEBUG: Field '${field.name}' - filename='${field.filename}', type='${field.type}', dataLen=${field.data?.length || 0}`)
      }

      const metadataFields = formData.filter(field => !field.filename)
      logger.info(`🔍 JESSICA'S DEBUG: Processing ${metadataFields.length} metadata fields`)
      logger.info(`🔍 JESSICA'S DEBUG: All form field names: ${formData.map(f => f.name).join(', ')}`)

      for (const field of metadataFields) {
        const fieldName = field.name
        const fieldValue = field.data.toString()
        logger.info(`🔍 JESSICA'S DEBUG: Processing field ${fieldName} = ${fieldValue}`)

        if (fieldName === 'purpose') {
          purpose = fieldValue
        } else if (fieldName === 'error_message') {
          errorMessage = fieldValue
        } else if (fieldName === 'job_type') {
          jobType = fieldValue
          logger.info(`🔄 JOB TYPE: Received explicit job_type=${jobType}`)
        } else if (fieldName === 'workflow_type') {
          workflowType = fieldValue
          logger.info(`🔄 WORKFLOW TYPE: Received explicit workflow_type=${workflowType}`)
        } else if (fieldName === 'tag_results') {
          tagResults = fieldValue
          logger.info(`🏷️ TAG RESULTS: Received tag_results=${tagResults}`)
        } else if (fieldName === 'media_uuid') {
          mediaUuid = fieldValue
          logger.info(`🏷️ MEDIA UUID: Received media_uuid=${mediaUuid}`)
        } else if (fieldName === 'source_media_uuid') {
          sourceMediaUuid = fieldValue
          logger.info(`🔗 SOURCE UUID: Received source media UUID for output linking: ${sourceMediaUuid}`)
        } else if (fieldName && fieldName.startsWith('source_media_uuid_')) {
          // Extract individual source UUIDs for each file (e.g., source_media_uuid_0, source_media_uuid_1, etc.)
          const fileIndex = fieldName.replace('source_media_uuid_', '')
          sourceMediaUuids.set(fileIndex, fieldValue)
          logger.info(`🔗 INDIVIDUAL SOURCE UUID: File ${fileIndex} -> ${fieldValue}`)
        } else if (fieldName && fieldName.startsWith('video_')) {
          // Extract video metadata fields (video_fps_0, video_codec_0, video_bitrate_0, etc.)
          const parts = fieldName.split('_')
          if (parts.length >= 3) {
            const metadataType = parts[1] // fps, codec, bitrate, width, height, duration
            const fileIndex = parts[2] // 0, 1, 2, etc.

            if (!videoMetadata.has(fileIndex)) {
              videoMetadata.set(fileIndex, {})
            }

            const metadata = videoMetadata.get(fileIndex)

            // Parse numeric values appropriately
            if (metadataType === 'fps' || metadataType === 'duration') {
              metadata[metadataType] = parseFloat(fieldValue)
            } else if (metadataType === 'bitrate' || metadataType === 'width' || metadataType === 'height') {
              metadata[metadataType] = parseInt(fieldValue)
            } else {
              metadata[metadataType] = fieldValue // codec as string
            }

            logger.info(`🎬 VIDEO METADATA: File ${fileIndex} ${metadataType} = ${fieldValue}`)
          }
        }
      }

      logger.info(`🔍 JESSICA'S DEBUG: Final sourceMediaUuid = ${sourceMediaUuid}`)
      logger.info(`🔍 JESSICA'S DEBUG: Final sourceMediaUuids map = ${JSON.stringify(Object.fromEntries(sourceMediaUuids))}`)
    } // End of else block for multipart form data

    // REQUIRED: Throw error if job_type is not provided
    if (!jobType) {
      const error = 'job_type is required but not provided in request'
      logger.info(`❌ ERROR: ${error}`)
      throw createError({
        statusCode: 400,
        statusMessage: error
      })
    }

    logger.info(`🔗 SOURCE UUID MAPPING: Found ${sourceMediaUuids.size} individual source UUIDs`)

    // Handle error case
    if (purpose === 'error') {
      logger.info(`❌ Job ${jobId} failed with error: ${errorMessage}`)

      // Clean up orphaned output images when job fails
      logger.info(`🗑️ Cleaning up orphaned output images for failed job ${jobId}...`)
      const { and, sql } = await import('drizzle-orm')
      try {
        const deletedOrphans = await db
          .delete(mediaRecords)
          .where(and(eq(mediaRecords.jobId, jobId), eq(mediaRecords.purpose, 'output'), eq(mediaRecords.type, 'image'), sql`${mediaRecords.uuid} NOT IN (SELECT thumbnail_uuid FROM media_records WHERE thumbnail_uuid IS NOT NULL)`))
          .returning({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename
          })

        if (deletedOrphans.length > 0) {
          logger.info(
            `✅ Deleted ${deletedOrphans.length} orphaned output images for failed job:`,
            deletedOrphans.map(m => m.filename)
          )
        } else {
          logger.info(`ℹ️ No orphaned output images found for failed job ${jobId}`)
        }
      } catch (cleanupError) {
        logger.error(`⚠️ Failed to clean up orphaned output images for failed job ${jobId}:`, cleanupError)
      }

      // Update job status to failed
      await db
        .update(jobs)
        .set({
          status: 'failed',
          errorMessage: errorMessage || 'Job processing failed',
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(jobs.id, jobId))

      // Update job counts for WebSocket clients
      try {
        const { updateJobCounts } = await import('~/server/services/systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        logger.error('Failed to update job counts after job failure:', error)
      }

      // Job triggering is now handled exclusively by the continuous processing interval
      // This prevents race conditions and ensures proper job sequencing
      logger.info('🔄 Job failed - continuous processing will handle next job automatically')

      return {
        success: true,
        message: `Job ${jobId} marked as failed`,
        error: errorMessage
      }
    }

    // Handle tagging job type - tag_results is always a dict: {uuid: tags, ...}
    if (jobType === 'tagging' && tagResults) {
      const { filterAndNormalizeTags } = await import('~/server/utils/tagConfig')

      // tagResults is already in dict format: { uuid: rawTags }
      const tagsToProcess: Record<string, string> = tagResults

      logger.info(`🏷️ TAGGING: Processing ${Object.keys(tagsToProcess).length} media items`)

      const results: Array<{ uuid: string; filteredCount: number }> = []

      for (const [targetUuid, rawTags] of Object.entries(tagsToProcess)) {
        const filteredTags = filterAndNormalizeTags(rawTags)
        const tagsObject = {
          tags: filteredTags,
          rawTags,
          model: 'wd14-tagger',
          confidence: 0.35,
          timestamp: new Date().toISOString(),
          source: 'comfyui-auto-tagging'
        }

        const updated = await db
          .update(mediaRecords)
          .set({ tags: tagsObject, updatedAt: new Date() })
          .where(eq(mediaRecords.uuid, targetUuid))
          .returning({ uuid: mediaRecords.uuid })

        if (updated.length > 0) {
          results.push({ uuid: targetUuid, filteredCount: filteredTags.length })
          logger.info(`✅ TAGGING: ${targetUuid} -> ${filteredTags.length} tags`)
        } else {
          logger.warn(`⚠️ TAGGING: ${targetUuid} not found`)
        }
      }

      // Delete temporary tagging job
      await db.delete(jobs).where(eq(jobs.id, jobId))
      logger.info(`🗑️ TAGGING: Deleted job ${jobId}`)

      try {
        const { updateJobCounts } = await import('~/server/services/systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        logger.error('Failed to update job counts:', error)
      }

      return {
        success: true,
        message: `Tagged ${results.length} media items`,
        job_id: jobId,
        results
      }
    }

    // SINGLE REQUEST PROCESSING: Process ALL files at once
    const files = formData?.filter(field => field.filename) || []

    logger.info(`📦 SINGLE REQUEST: Received ${files.length} files in single request for job ${jobId}`)
    logger.info(`📦 FILES DEBUG: ${files.map(f => `${f.filename} (${f.data?.length || 0} bytes)`).join(', ')}`)
    logger.info(`📦 FORM DATA DEBUG: Total form fields: ${formData?.length || 0}`)
    logger.info(
      `📦 FORM DATA DEBUG: Non-file fields: ${formData
        ?.filter(f => !f.filename)
        .map(f => `${f.name}=${f.data?.toString()}`)
        .join(', ') || 'none'}`
    )
    logger.info(`📦 JOB DEBUG: sourceMediaUuid=${job?.sourceMediaUuid}, explicit job_type=${jobType}`)

    const savedMedia = []

    // Categorize files by type for processing
    const videoFiles = []
    const imageFiles = []

    logger.info(`📦 CATEGORIZATION: Processing ${files.length} files from request`)

    for (const file of files) {
      if (!file.data || file.data.length === 0) {
        logger.info(`⚠️ Skipping empty file: ${file.filename}`)
        continue
      }

      const filename = file.filename?.toLowerCase() || ''
      if (filename.endsWith('.mp4') || filename.endsWith('.avi') || filename.endsWith('.mov') || filename.endsWith('.mkv') || filename.endsWith('.webm')) {
        videoFiles.push(file)
      } else if (filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.webp')) {
        imageFiles.push(file)
      }
    }

    logger.info(`📊 CATEGORIZED: ${videoFiles.length} videos, ${imageFiles.length} images`)

    // Fetch tags from destination video record if available
    let destVideoTags = null
    if (job?.destMediaUuid) {
      try {
        const destVideoRecord = await db
          .select({
            tags: mediaRecords.tags
          })
          .from(mediaRecords)
          .where(eq(mediaRecords.uuid, job.destMediaUuid))
          .limit(1)

        if (destVideoRecord.length > 0) {
          destVideoTags = destVideoRecord[0].tags
          logger.info(`🏷️ Found destination video tags:`, destVideoTags)
        }
      } catch (tagError) {
        logger.error(`⚠️ Failed to fetch destination video tags:`, tagError)
        // Don't fail the job if tag fetching fails
      }
    }

    // Get encryption key from environment
    const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
    if (!encryptionKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Media encryption not configured'
      })
    }

    let thumbnailRecord = null

    // Process image files first (as thumbnails if we have videos)
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      logger.info(`🖼️ Processing image file ${i}: ${file.filename} (${file.data.length} bytes)`)

      // Get the individual source UUID for this specific file
      const fileSourceUuid = sourceMediaUuids.get(i.toString()) || sourceMediaUuid
      logger.info(`🔗 FILE SOURCE UUID: File ${i} (${file.filename}) -> ${fileSourceUuid}`)

      // Calculate checksum of the original file data
      const { createHash } = await import('crypto')
      const checksum = createHash('sha256').update(file.data).digest('hex')

      // Encrypt the file data using Fernet encryption
      const { encryptMediaData } = await import('~/server/utils/encryption')
      const encryptedData = encryptMediaData(file.data, encryptionKey)

      // Determine purpose based on whether we have videos
      const imagePurpose = videoFiles.length > 0 ? 'thumbnail' : 'output'
      const imageType = 'image'

      logger.info(`🎯 THUMBNAIL LOGIC: videoFiles.length=${videoFiles.length}, imagePurpose=${imagePurpose}`)

      // Strip path from filename for storage
      const baseFilename = file.filename ? path.basename(file.filename) : 'thumbnail.png'

      logger.info(`💾 CREATING IMAGE MEDIA RECORD:`, {
        filename: baseFilename,
        type: imageType,
        purpose: imagePurpose,
        subjectUuid: job?.subjectUuid || null,
        destMediaUuidRef: job?.destMediaUuid || null,
        sourceMediaUuidRef: fileSourceUuid || null,
        fileSize: file.data.length,
        jobId: jobId
      })

      // Use explicit workflow_type parameter to determine workflow behavior
      // 'test' workflow = multiple outputs, always create new records
      // 'vid' workflow = 1 video + 1 thumbnail, use update logic
      const isTestWorkflow = workflowType === 'test'

      let mediaRecord
      if (isTestWorkflow) {
        // TEST WORKFLOW: Always create separate records for each output image
        logger.info(`✨ TEST WORKFLOW (${workflowType}): Creating NEW media record for each output image: job ${jobId}, source ${fileSourceUuid}, filename ${baseFilename}`)
        logger.info(`✨ TEST WORKFLOW DEBUG: fileSourceUuid=${fileSourceUuid}, subjectUuid=${job?.subjectUuid}, purpose=${imagePurpose}`)
        mediaRecord = await db
          .insert(mediaRecords)
          .values({
            filename: baseFilename,
            type: imageType,
            purpose: imagePurpose,
            subjectUuid: job?.subjectUuid || null,
            destMediaUuidRef: job?.destMediaUuid || null,
            sourceMediaUuidRef: fileSourceUuid || null, // Link to source subject image
            encryptedData: encryptedData,
            fileSize: file.data.length,
            originalSize: file.data.length,
            checksum: checksum,
            jobId: jobId
          })
          .returning({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename,
            type: mediaRecords.type,
            sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
          })
      } else {
        // VID WORKFLOW: Use update logic for 1 video + 1 thumbnail behavior
        if (!fileSourceUuid || !job?.subjectUuid) {
          throw createError({
            statusCode: 400,
            statusMessage: `Vid workflow requires both fileSourceUuid and subjectUuid. Got fileSourceUuid: ${fileSourceUuid}, subjectUuid: ${job?.subjectUuid}`
          })
        }

        const { and } = await import('drizzle-orm')
        const existingRecord = await db
          .select({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename,
            type: mediaRecords.type,
            sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
          })
          .from(mediaRecords)
          .where(
            and(
              eq(mediaRecords.jobId, jobId), // CRITICAL FIX: Only update records from the SAME job
              eq(mediaRecords.sourceMediaUuidRef, fileSourceUuid),
              eq(mediaRecords.subjectUuid, job.subjectUuid),
              eq(mediaRecords.purpose, imagePurpose),
              eq(mediaRecords.type, imageType)
            )
          )
          .limit(1)

        if (existingRecord.length > 0) {
          // Update existing record (only from the same job)
          logger.info(`🔄 VID WORKFLOW: Updating existing media record for job ${jobId}, source ${fileSourceUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db
            .update(mediaRecords)
            .set({
              filename: baseFilename,
              encryptedData: encryptedData,
              fileSize: file.data.length,
              originalSize: file.data.length,
              checksum: checksum,
              updatedAt: new Date()
            })
            .where(eq(mediaRecords.uuid, existingRecord[0].uuid))
            .returning({
              uuid: mediaRecords.uuid,
              filename: mediaRecords.filename,
              type: mediaRecords.type,
              sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
            })
        } else {
          // Create new record (always create new records for different jobs)
          logger.info(`✨ VID WORKFLOW: Creating NEW media record for job ${jobId}, source ${fileSourceUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db
            .insert(mediaRecords)
            .values({
              filename: baseFilename,
              type: imageType,
              purpose: imagePurpose,
              subjectUuid: job?.subjectUuid || null,
              destMediaUuidRef: job?.destMediaUuid || null,
              sourceMediaUuidRef: fileSourceUuid || null, // Link to source subject image
              encryptedData: encryptedData,
              fileSize: file.data.length,
              originalSize: file.data.length,
              checksum: checksum,
              jobId: jobId
            })
            .returning({
              uuid: mediaRecords.uuid,
              filename: mediaRecords.filename,
              type: mediaRecords.type,
              sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
            })
        }
      }

      const imageRecord = mediaRecord[0]
      savedMedia.push(imageRecord)

      logger.info(`✅ RECORD CREATED: ${imageRecord.uuid} with sourceMediaUuidRef=${imageRecord.sourceMediaUuidRef}, filename=${imageRecord.filename}`)

      if (imagePurpose === 'thumbnail') {
        thumbnailRecord = imageRecord
        logger.info(`✅ Saved thumbnail: ${imageRecord.uuid} - WILL BE LINKED TO VIDEOS`)
      } else {
        logger.info(`✅ Saved image: ${imageRecord.uuid}`)
      }
    }

    logger.info(`🔍 THUMBNAIL STATUS BEFORE VIDEO PROCESSING: thumbnailRecord=${thumbnailRecord ? thumbnailRecord.uuid : 'NULL'}`)

    // Delete existing output images for this job when we receive videos
    if (videoFiles.length > 0) {
      logger.info(`🗑️ CLEANUP: Deleting existing output images for job ${jobId} before processing videos`)
      const { and } = await import('drizzle-orm')

      try {
        const deletedRecords = await db
          .delete(mediaRecords)
          .where(and(eq(mediaRecords.jobId, jobId), eq(mediaRecords.purpose, 'output'), eq(mediaRecords.type, 'image')))
          .returning({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename
          })

        if (deletedRecords.length > 0) {
          logger.info(
            `🗑️ DELETED: Removed ${deletedRecords.length} output images for job ${jobId}:`,
            deletedRecords.map(r => `${r.filename} (${r.uuid})`)
          )
        } else {
          logger.info(`🗑️ CLEANUP: No existing output images found for job ${jobId}`)
        }
      } catch (deleteError) {
        logger.error(`⚠️ Failed to delete existing output images for job ${jobId}:`, deleteError)
        // Don't fail the job if cleanup fails, just log the error
      }
    }

    // Process video files with thumbnail reference
    for (let fileIndex = 0; fileIndex < videoFiles.length; fileIndex++) {
      const file = videoFiles[fileIndex]
      logger.info(`🎬 Processing video file ${fileIndex}: ${file.filename} (${file.data.length} bytes)`)

      // Calculate checksum of the original file data
      const { createHash } = await import('crypto')
      const checksum = createHash('sha256').update(file.data).digest('hex')

      // Encrypt the file data using Fernet encryption
      const { encryptMediaData } = await import('~/server/utils/encryption')
      const encryptedData = encryptMediaData(file.data, encryptionKey)

      // Strip path from filename for storage
      const baseFilename = file.filename ? path.basename(file.filename) : 'output.mp4'

      // Get video metadata for this file
      const fileMetadata = videoMetadata.get(fileIndex.toString()) || {}
      logger.info(`🎬 Video metadata for file ${fileIndex}:`, fileMetadata)

      logger.info(`💾 CREATING VIDEO MEDIA RECORD:`, {
        filename: baseFilename,
        type: 'video',
        purpose: purpose,
        subjectUuid: job?.subjectUuid || null,
        destMediaUuidRef: job?.destMediaUuid || null,
        sourceMediaUuidRef: sourceMediaUuid || null,
        thumbnailUuid: thumbnailRecord?.uuid || null,
        fileSize: file.data.length,
        jobId: jobId,
        hasThumbnailRecord: !!thumbnailRecord,
        thumbnailRecordUuid: thumbnailRecord?.uuid || 'NO_THUMBNAIL',
        videoMetadata: fileMetadata
      })

      // Check if a record already exists for this EXACT job, source UUID and subject UUID combination
      let mediaRecord
      if (workflowType === 'vid' && sourceMediaUuid && job?.subjectUuid) {
        const { and } = await import('drizzle-orm')
        const existingRecord = await db
          .select({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename,
            type: mediaRecords.type,
            sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
          })
          .from(mediaRecords)
          .where(
            and(
              eq(mediaRecords.jobId, jobId), // CRITICAL FIX: Only update records from the SAME job
              eq(mediaRecords.sourceMediaUuidRef, sourceMediaUuid),
              eq(mediaRecords.subjectUuid, job.subjectUuid),
              eq(mediaRecords.purpose, purpose),
              eq(mediaRecords.type, 'video')
            )
          )
          .limit(1)

        if (existingRecord.length > 0) {
          // Update existing record (only from the same job)
          logger.info(`🔄 VID WORKFLOW (${workflowType}): Updating existing video media record for job ${jobId}, source ${sourceMediaUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db
            .update(mediaRecords)
            .set({
              filename: baseFilename,
              thumbnailUuid: thumbnailRecord?.uuid || null,
              encryptedData: encryptedData,
              fileSize: file.data.length,
              originalSize: file.data.length,
              checksum: checksum,
              tags: destVideoTags, // Apply tags from destination video
              fps: fileMetadata.fps || null,
              codec: fileMetadata.codec || null,
              bitrate: fileMetadata.bitrate || null,
              width: fileMetadata.width || null,
              height: fileMetadata.height || null,
              duration: fileMetadata.duration || null,
              updatedAt: new Date()
            })
            .where(eq(mediaRecords.uuid, existingRecord[0].uuid))
            .returning({
              uuid: mediaRecords.uuid,
              filename: mediaRecords.filename,
              type: mediaRecords.type,
              sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
            })
        } else {
          // Create new record (always create new records for different jobs)
          logger.info(`✨ VID WORKFLOW (${workflowType}): Creating NEW video media record for job ${jobId}, source ${sourceMediaUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db
            .insert(mediaRecords)
            .values({
              filename: baseFilename,
              type: 'video',
              purpose: purpose,
              subjectUuid: job?.subjectUuid || null,
              destMediaUuidRef: job?.destMediaUuid || null,
              sourceMediaUuidRef: sourceMediaUuid || null, // Link to source subject image
              thumbnailUuid: thumbnailRecord?.uuid || null, // Link to thumbnail if available
              encryptedData: encryptedData,
              fileSize: file.data.length,
              originalSize: file.data.length,
              checksum: checksum,
              jobId: jobId,
              tags: destVideoTags, // Apply tags from destination video
              fps: fileMetadata.fps || null,
              codec: fileMetadata.codec || null,
              bitrate: fileMetadata.bitrate || null,
              width: fileMetadata.width || null,
              height: fileMetadata.height || null,
              duration: fileMetadata.duration || null
            })
            .returning({
              uuid: mediaRecords.uuid,
              filename: mediaRecords.filename,
              type: mediaRecords.type,
              sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
            })
        }
      } else {
        // Create new record (fallback for cases without source UUID)
        mediaRecord = await db
          .insert(mediaRecords)
          .values({
            filename: baseFilename,
            type: 'video',
            purpose: purpose,
            subjectUuid: job?.subjectUuid || null,
            destMediaUuidRef: job?.destMediaUuid || null,
            sourceMediaUuidRef: sourceMediaUuid || null, // Link to source subject image
            thumbnailUuid: thumbnailRecord?.uuid || null, // Link to thumbnail if available
            encryptedData: encryptedData,
            fileSize: file.data.length,
            originalSize: file.data.length,
            checksum: checksum,
            jobId: jobId,
            tags: destVideoTags, // Apply tags from destination video
            fps: fileMetadata.fps || null,
            codec: fileMetadata.codec || null,
            bitrate: fileMetadata.bitrate || null,
            width: fileMetadata.width || null,
            height: fileMetadata.height || null,
            duration: fileMetadata.duration || null
          })
          .returning({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename,
            type: mediaRecords.type,
            sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
          })
      }

      const videoRecord = mediaRecord[0]
      savedMedia.push(videoRecord)
      logger.info(`✅ Saved video: ${videoRecord.uuid}${thumbnailRecord ? ` with thumbnail ${thumbnailRecord.uuid}` : ' WITHOUT THUMBNAIL'}`)

      // Update thumbnail record to reference the video (just update timestamp for tracking)
      if (thumbnailRecord) {
        await db
          .update(mediaRecords)
          .set({
            updatedAt: new Date()
          })
          .where(eq(mediaRecords.uuid, thumbnailRecord.uuid))

        logger.info(`🔗 Linked thumbnail ${thumbnailRecord.uuid} to video ${videoRecord.uuid} via thumbnailUuid field`)
      } else {
        logger.info(`⚠️ NO THUMBNAIL RECORD AVAILABLE for video ${videoRecord.uuid}`)
      }
    }

    if (savedMedia.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No valid files were processed'
      })
    }

    // SINGLE REQUEST COMPLETION: All files processed in single request
    logger.info(`📦 COMPLETION: Processing completion for ${savedMedia.length} files`)

    // Determine job status based on output type
    const hasImages = savedMedia.some(media => media.type === 'image')
    const hasVideos = savedMedia.some(media => media.type === 'video')

    let jobStatus: 'completed' | 'need_input' = 'completed'
    let statusMessage = `Job ${jobId} completed successfully with ${savedMedia.length} files`

    // If we only got images and no videos, this likely means the job needs input (test workflow)
    if (hasImages && !hasVideos) {
      jobStatus = 'need_input'
      statusMessage = `Job ${jobId} produced ${savedMedia.length} images - needs additional input for video generation`
      logger.info(`🔄 STATUS: Job ${jobId} marked as need_input - received images instead of video`)
    } else {
      logger.info(`✅ STATUS: Job ${jobId} completed successfully with ${savedMedia.length} output files`)
    }

    // Update job with output UUID (use the video if available, otherwise first output)
    const mainOutput = savedMedia.find(media => media.type === 'video') || savedMedia[0]

    // First check the current job status to avoid race conditions with the "keep only 2 active jobs" logic
    const currentJobStatus = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1)

    if (currentJobStatus.length === 0) {
      logger.error(`⚠️ Job ${jobId} not found when trying to update status to ${jobStatus}`)
    } else if (currentJobStatus[0].status === 'failed') {
      logger.info(`⚠️ Job ${jobId} is already marked as failed - not updating to ${jobStatus}`)
      logger.info(`⚠️ This is likely due to the "keep only 2 active jobs" logic in jobProcessingService.ts`)

      // Just update the outputUuid to link the output to the job
      // Don't change the status or progress since it's already marked as failed
      await db
        .update(jobs)
        .set({
          outputUuid: mainOutput.uuid,
          updatedAt: new Date()
        })
        .where(eq(jobs.id, jobId))

      logger.info(`✅ Updated job ${jobId} with output UUID while preserving failed status`)
    } else {
      // Normal update flow for active jobs
      await db
        .update(jobs)
        .set({
          status: jobStatus,
          outputUuid: mainOutput.uuid,
          progress: jobStatus === 'completed' ? 100 : 0, // 75% if need_input, 100% if completed
          completedAt: jobStatus === 'completed' ? new Date() : null,
          errorMessage: null, // Clear any previous error messages on successful completion
          updatedAt: new Date()
        })
        .where(eq(jobs.id, jobId))

      // Clean up orphaned output images when job completes
      if (jobStatus === 'completed') {
        logger.info(`🗑️ Cleaning up orphaned output images for completed job ${jobId}...`)
        const { and, sql } = await import('drizzle-orm')
        try {
          const deletedOrphans = await db
            .delete(mediaRecords)
            .where(and(eq(mediaRecords.jobId, jobId), eq(mediaRecords.purpose, 'output'), eq(mediaRecords.type, 'image'), sql`${mediaRecords.uuid} NOT IN (SELECT thumbnail_uuid FROM media_records WHERE thumbnail_uuid IS NOT NULL)`))
            .returning({
              uuid: mediaRecords.uuid,
              filename: mediaRecords.filename
            })

          if (deletedOrphans.length > 0) {
            logger.info(
              `✅ Deleted ${deletedOrphans.length} orphaned output images for completed job:`,
              deletedOrphans.map(m => m.filename)
            )
          } else {
            logger.info(`ℹ️ No orphaned output images found for completed job ${jobId}`)
          }
        } catch (cleanupError) {
          logger.error(`⚠️ Failed to clean up orphaned output images for completed job ${jobId}:`, cleanupError)
        }
      }
    }

    // Update job counts for WebSocket clients after status change
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      logger.error('Failed to update job counts after job completion:', error)
    }

    // Job triggering is now handled exclusively by the continuous processing interval
    // This prevents race conditions and ensures proper job sequencing
    logger.info('🔄 COMPLETION: Continuous processing will handle next job automatically')

    return {
      success: true,
      message: statusMessage,
      job_id: jobId,
      status: jobStatus,
      output_files: savedMedia.map(media => ({
        uuid: media.uuid,
        filename: media.filename,
        type: media.type
      })),
      file_info: {
        total_files_processed: savedMedia.length,
        videos: hasVideos ? savedMedia.filter(m => m.type === 'video').length : 0,
        images: hasImages ? savedMedia.filter(m => m.type === 'image').length : 0
      }
    }
  } catch (error: any) {
    logger.error(`❌ Failed to process outputs for job ${jobId}:`, error)

    // Try to update the job status to failed with error message
    try {
      const { getDb } = await import('~/server/utils/database')
      const { jobs } = await import('~/server/utils/schema')
      const { eq } = await import('drizzle-orm')

      const db = getDb()

      // First check the current job status to avoid race conditions with the "keep only 2 active jobs" logic
      const currentJobStatus = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1)

      if (currentJobStatus.length === 0) {
        logger.info(`⚠️ Job ${jobId} not found when trying to update status to failed`)
      } else if (currentJobStatus[0].status === 'failed') {
        logger.info(`⚠️ Job ${jobId} is already marked as failed - not updating error message`)
        logger.info(`⚠️ This is likely due to the "keep only 2 active jobs" logic in jobProcessingService.ts`)
      } else {
        // Normal update flow for active jobs
        await db
          .update(jobs)
          .set({
            status: 'failed',
            errorMessage: error.message || error.statusMessage || 'Failed to process job outputs',
            completedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(jobs.id, jobId))

        logger.info(`📝 Updated job ${jobId} status to failed`)
      }

      // Update job counts for WebSocket clients after status change
      try {
        const { updateJobCounts } = await import('~/server/services/systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        logger.error('Failed to update job counts after job failure in catch block:', error)
      }

      // Job triggering is now handled exclusively by the continuous processing interval
      // This prevents race conditions and ensures proper job sequencing
      logger.info('🔄 Job failed during processing - continuous processing will handle next job automatically')
    } catch (updateError) {
      logger.error(`❌ Failed to update job ${jobId} status:`, updateError)
    }

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to process job outputs: ${error.message || 'Unknown error'}`
    })
  }
})
