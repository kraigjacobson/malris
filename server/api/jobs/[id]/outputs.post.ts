/**
 * Receive job outputs from comfyui-runpod-worker
 * This endpoint handles the completion of jobs and stores the output media
 */
import path from 'path'

export default defineEventHandler(async (event) => {
  const jobId = getRouterParam(event, 'id')
  
  if (!jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Job ID is required'
    })
  }

  try {
    console.log(`📥 Receiving outputs for job ${jobId}`)
    
    const { getDb } = await import('~/server/utils/database')
    const { jobs, mediaRecords } = await import('~/server/utils/schema')
    const { eq } = await import('drizzle-orm')
    
    const db = getDb()
    
    // Verify the job exists in the database
    const existingJob = await db.select({
      id: jobs.id,
      status: jobs.status,
      subjectUuid: jobs.subjectUuid,
      destMediaUuid: jobs.destMediaUuid,
      sourceMediaUuid: jobs.sourceMediaUuid, // Add this to determine workflow type
    }).from(jobs).where(eq(jobs.id, jobId)).limit(1)
    
    if (existingJob.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Job not found'
      })
    }
    
    const job = existingJob[0]
    
    // Parse form data to get files and metadata
    const formData = await readMultipartFormData(event)
    
    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No files received'
      })
    }
    
    // Extract metadata from form data
    let purpose = 'output'
    let errorMessage = null
    let sourceMediaUuid = null
    let jobType = null // Add job_type variable
    let workflowType = null // Add workflow_type variable
    const sourceMediaUuids = new Map<string, string>() // Map filename to source UUID
    
    const metadataFields = formData.filter(field => !field.filename)
    console.log(`🔍 JESSICA'S DEBUG: Processing ${metadataFields.length} metadata fields`)
    console.log(`🔍 JESSICA'S DEBUG: All form field names: ${formData.map(f => f.name).join(', ')}`)
    
    for (const field of metadataFields) {
      const fieldName = field.name
      const fieldValue = field.data.toString()
      console.log(`🔍 JESSICA'S DEBUG: Processing field ${fieldName} = ${fieldValue}`)
      
      if (fieldName === 'purpose') {
        purpose = fieldValue
      } else if (fieldName === 'error_message') {
        errorMessage = fieldValue
      } else if (fieldName === 'job_type') {
        jobType = fieldValue
        console.log(`🔄 JOB TYPE: Received explicit job_type=${jobType}`)
      } else if (fieldName === 'workflow_type') {
        workflowType = fieldValue
        console.log(`🔄 WORKFLOW TYPE: Received explicit workflow_type=${workflowType}`)
      } else if (fieldName === 'source_media_uuid') {
        sourceMediaUuid = fieldValue
        console.log(`🔗 SOURCE UUID: Received source media UUID for output linking: ${sourceMediaUuid}`)
      } else if (fieldName && fieldName.startsWith('source_media_uuid_')) {
        // Extract individual source UUIDs for each file (e.g., source_media_uuid_0, source_media_uuid_1, etc.)
        const fileIndex = fieldName.replace('source_media_uuid_', '')
        sourceMediaUuids.set(fileIndex, fieldValue)
        console.log(`🔗 INDIVIDUAL SOURCE UUID: File ${fileIndex} -> ${fieldValue}`)
      }
    }
    
    console.log(`🔍 JESSICA'S DEBUG: Final sourceMediaUuid = ${sourceMediaUuid}`)
    console.log(`🔍 JESSICA'S DEBUG: Final sourceMediaUuids map = ${JSON.stringify(Object.fromEntries(sourceMediaUuids))}`)
    
    // REQUIRED: Throw error if job_type is not provided
    if (!jobType) {
      const error = "job_type is required but not provided in request"
      console.log(`❌ ERROR: ${error}`)
      throw createError({
        statusCode: 400,
        statusMessage: error
      })
    }
    
    console.log(`🔗 SOURCE UUID MAPPING: Found ${sourceMediaUuids.size} individual source UUIDs`)
    
    // Handle error case
    if (purpose === 'error') {
      console.log(`❌ Job ${jobId} failed with error: ${errorMessage}`)
      
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
        console.error('Failed to update job counts after job failure:', error)
      }
      
      // Job triggering is now handled exclusively by the continuous processing interval
      // This prevents race conditions and ensures proper job sequencing
      console.log('🔄 Job failed - continuous processing will handle next job automatically')
      
      return {
        success: true,
        message: `Job ${jobId} marked as failed`,
        error: errorMessage
      }
    }
    
    // SINGLE REQUEST PROCESSING: Process ALL files at once
    const files = formData.filter(field => field.filename)
    
    console.log(`📦 SINGLE REQUEST: Received ${files.length} files in single request for job ${jobId}`)
    console.log(`📦 FILES DEBUG: ${files.map(f => `${f.filename} (${f.data?.length || 0} bytes)`).join(', ')}`)
    console.log(`📦 FORM DATA DEBUG: Total form fields: ${formData.length}`)
    console.log(`📦 FORM DATA DEBUG: Non-file fields: ${formData.filter(f => !f.filename).map(f => `${f.name}=${f.data?.toString()}`).join(', ')}`)
    console.log(`📦 JOB DEBUG: sourceMediaUuid=${job?.sourceMediaUuid}, explicit job_type=${jobType}`)
    
    const savedMedia = []
    
    // Categorize files by type for processing
    const videoFiles = []
    const imageFiles = []
    
    console.log(`📦 CATEGORIZATION: Processing ${files.length} files from request`)
    
    for (const file of files) {
      if (!file.data || file.data.length === 0) {
        console.log(`⚠️ Skipping empty file: ${file.filename}`)
        continue
      }
      
      const filename = file.filename?.toLowerCase() || ''
      if (filename.endsWith('.mp4') || filename.endsWith('.avi') || filename.endsWith('.mov') || filename.endsWith('.mkv') || filename.endsWith('.webm')) {
        videoFiles.push(file)
      } else if (filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.webp')) {
        imageFiles.push(file)
      }
    }
    
    console.log(`📊 CATEGORIZED: ${videoFiles.length} videos, ${imageFiles.length} images`)
    
    // Fetch tags from destination video record if available
    let destVideoTags = null
    if (job?.destMediaUuid) {
      try {
        const destVideoRecord = await db.select({
          tags: mediaRecords.tags
        }).from(mediaRecords).where(eq(mediaRecords.uuid, job.destMediaUuid)).limit(1)
        
        if (destVideoRecord.length > 0) {
          destVideoTags = destVideoRecord[0].tags
          console.log(`🏷️ Found destination video tags:`, destVideoTags)
        }
      } catch (tagError) {
        console.error(`⚠️ Failed to fetch destination video tags:`, tagError)
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
      console.log(`🖼️ Processing image file ${i}: ${file.filename} (${file.data.length} bytes)`)
      
      // Get the individual source UUID for this specific file
      const fileSourceUuid = sourceMediaUuids.get(i.toString()) || sourceMediaUuid
      console.log(`🔗 FILE SOURCE UUID: File ${i} (${file.filename}) -> ${fileSourceUuid}`)
      
      // Calculate checksum of the original file data
      const { createHash } = await import('crypto')
      const checksum = createHash('sha256').update(file.data).digest('hex')
      
      // Encrypt the file data using Fernet encryption
      const { encryptMediaData } = await import('~/server/utils/encryption')
      const encryptedData = encryptMediaData(file.data, encryptionKey)
      
      // Determine purpose based on whether we have videos
      const imagePurpose = videoFiles.length > 0 ? 'thumbnail' : 'output'
      const imageType = 'image'
      
      console.log(`🎯 THUMBNAIL LOGIC: videoFiles.length=${videoFiles.length}, imagePurpose=${imagePurpose}`)
      
      // Strip path from filename for storage
      const baseFilename = file.filename ? path.basename(file.filename) : 'thumbnail.png'
      
      console.log(`💾 CREATING IMAGE MEDIA RECORD:`, {
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
        console.log(`✨ TEST WORKFLOW (${workflowType}): Creating NEW media record for each output image: job ${jobId}, source ${fileSourceUuid}, filename ${baseFilename}`)
        console.log(`✨ TEST WORKFLOW DEBUG: fileSourceUuid=${fileSourceUuid}, subjectUuid=${job?.subjectUuid}, purpose=${imagePurpose}`)
        mediaRecord = await db.insert(mediaRecords).values({
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
        }).returning({
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
        const existingRecord = await db.select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
        }).from(mediaRecords).where(
          and(
            eq(mediaRecords.jobId, jobId), // CRITICAL FIX: Only update records from the SAME job
            eq(mediaRecords.sourceMediaUuidRef, fileSourceUuid),
            eq(mediaRecords.subjectUuid, job.subjectUuid),
            eq(mediaRecords.purpose, imagePurpose),
            eq(mediaRecords.type, imageType)
          )
        ).limit(1)

        if (existingRecord.length > 0) {
          // Update existing record (only from the same job)
          console.log(`🔄 VID WORKFLOW: Updating existing media record for job ${jobId}, source ${fileSourceUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db.update(mediaRecords)
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
          console.log(`✨ VID WORKFLOW: Creating NEW media record for job ${jobId}, source ${fileSourceUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db.insert(mediaRecords).values({
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
          }).returning({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename,
            type: mediaRecords.type,
            sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
          })
        }
      }
      
      const imageRecord = mediaRecord[0]
      savedMedia.push(imageRecord)
      
      console.log(`✅ RECORD CREATED: ${imageRecord.uuid} with sourceMediaUuidRef=${imageRecord.sourceMediaUuidRef}, filename=${imageRecord.filename}`)
      
      if (imagePurpose === 'thumbnail') {
        thumbnailRecord = imageRecord
        console.log(`✅ Saved thumbnail: ${imageRecord.uuid} - WILL BE LINKED TO VIDEOS`)
      } else {
        console.log(`✅ Saved image: ${imageRecord.uuid}`)
      }
    }
    
    console.log(`🔍 THUMBNAIL STATUS BEFORE VIDEO PROCESSING: thumbnailRecord=${thumbnailRecord ? thumbnailRecord.uuid : 'NULL'}`)
    
    // Delete existing output images for this job when we receive videos
    if (videoFiles.length > 0) {
      console.log(`🗑️ CLEANUP: Deleting existing output images for job ${jobId} before processing videos`)
      const { and } = await import('drizzle-orm')
      
      try {
        const deletedRecords = await db
          .delete(mediaRecords)
          .where(
            and(
              eq(mediaRecords.jobId, jobId),
              eq(mediaRecords.purpose, 'output'),
              eq(mediaRecords.type, 'image')
            )
          )
          .returning({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename
          })
        
        if (deletedRecords.length > 0) {
          console.log(`🗑️ DELETED: Removed ${deletedRecords.length} output images for job ${jobId}:`,
            deletedRecords.map(r => `${r.filename} (${r.uuid})`))
        } else {
          console.log(`🗑️ CLEANUP: No existing output images found for job ${jobId}`)
        }
      } catch (deleteError) {
        console.error(`⚠️ Failed to delete existing output images for job ${jobId}:`, deleteError)
        // Don't fail the job if cleanup fails, just log the error
      }
    }
    
    // Process video files with thumbnail reference
    for (const file of videoFiles) {
      console.log(`🎬 Processing video file: ${file.filename} (${file.data.length} bytes)`)
      
      // Calculate checksum of the original file data
      const { createHash } = await import('crypto')
      const checksum = createHash('sha256').update(file.data).digest('hex')
      
      // Encrypt the file data using Fernet encryption
      const { encryptMediaData } = await import('~/server/utils/encryption')
      const encryptedData = encryptMediaData(file.data, encryptionKey)
      
      // Strip path from filename for storage
      const baseFilename = file.filename ? path.basename(file.filename) : 'output.mp4'
      
      console.log(`💾 CREATING VIDEO MEDIA RECORD:`, {
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
        thumbnailRecordUuid: thumbnailRecord?.uuid || 'NO_THUMBNAIL'
      })
      
      // Check if a record already exists for this EXACT job, source UUID and subject UUID combination
      let mediaRecord
      if (workflowType === 'vid' && sourceMediaUuid && job?.subjectUuid) {
        const { and } = await import('drizzle-orm')
        const existingRecord = await db.select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
        }).from(mediaRecords).where(
          and(
            eq(mediaRecords.jobId, jobId), // CRITICAL FIX: Only update records from the SAME job
            eq(mediaRecords.sourceMediaUuidRef, sourceMediaUuid),
            eq(mediaRecords.subjectUuid, job.subjectUuid),
            eq(mediaRecords.purpose, purpose),
            eq(mediaRecords.type, 'video')
          )
        ).limit(1)

        if (existingRecord.length > 0) {
          // Update existing record (only from the same job)
          console.log(`🔄 VID WORKFLOW (${workflowType}): Updating existing video media record for job ${jobId}, source ${sourceMediaUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db.update(mediaRecords)
            .set({
              filename: baseFilename,
              thumbnailUuid: thumbnailRecord?.uuid || null,
              encryptedData: encryptedData,
              fileSize: file.data.length,
              originalSize: file.data.length,
              checksum: checksum,
              tags: destVideoTags, // Apply tags from destination video
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
          console.log(`✨ VID WORKFLOW (${workflowType}): Creating NEW video media record for job ${jobId}, source ${sourceMediaUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db.insert(mediaRecords).values({
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
            tags: destVideoTags // Apply tags from destination video
          }).returning({
            uuid: mediaRecords.uuid,
            filename: mediaRecords.filename,
            type: mediaRecords.type,
            sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
          })
        }
      } else {
        // Create new record (fallback for cases without source UUID)
        mediaRecord = await db.insert(mediaRecords).values({
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
          tags: destVideoTags // Apply tags from destination video
        }).returning({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
        })
      }
      
      const videoRecord = mediaRecord[0]
      savedMedia.push(videoRecord)
      console.log(`✅ Saved video: ${videoRecord.uuid}${thumbnailRecord ? ` with thumbnail ${thumbnailRecord.uuid}` : ' WITHOUT THUMBNAIL'}`)
      
      // Update thumbnail record to reference the video (just update timestamp for tracking)
      if (thumbnailRecord) {
        await db
          .update(mediaRecords)
          .set({
            updatedAt: new Date()
          })
          .where(eq(mediaRecords.uuid, thumbnailRecord.uuid))
        
        console.log(`🔗 Linked thumbnail ${thumbnailRecord.uuid} to video ${videoRecord.uuid} via thumbnailUuid field`)
      } else {
        console.log(`⚠️ NO THUMBNAIL RECORD AVAILABLE for video ${videoRecord.uuid}`)
      }
    }
    
    if (savedMedia.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No valid files were processed'
      })
    }
    
    // SINGLE REQUEST COMPLETION: All files processed in single request
    console.log(`📦 COMPLETION: Processing completion for ${savedMedia.length} files`)
    
    // Determine job status based on output type
    const hasImages = savedMedia.some(media => media.type === 'image')
    const hasVideos = savedMedia.some(media => media.type === 'video')
    
    let jobStatus: 'completed' | 'need_input' = 'completed'
    let statusMessage = `Job ${jobId} completed successfully with ${savedMedia.length} files`
    
    // If we only got images and no videos, this likely means the job needs input (test workflow)
    if (hasImages && !hasVideos) {
      jobStatus = 'need_input'
      statusMessage = `Job ${jobId} produced ${savedMedia.length} images - needs additional input for video generation`
      console.log(`🔄 STATUS: Job ${jobId} marked as need_input - received images instead of video`)
    } else {
      console.log(`✅ STATUS: Job ${jobId} completed successfully with ${savedMedia.length} output files`)
    }
    
    // Update job with output UUID (use the video if available, otherwise first output)
    const mainOutput = savedMedia.find(media => media.type === 'video') || savedMedia[0]
    
    // First check the current job status to avoid race conditions with the "keep only 2 active jobs" logic
    const currentJobStatus = await db
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)
    
    if (currentJobStatus.length === 0) {
      console.error(`⚠️ Job ${jobId} not found when trying to update status to ${jobStatus}`)
    } else if (currentJobStatus[0].status === 'failed') {
      console.log(`⚠️ Job ${jobId} is already marked as failed - not updating to ${jobStatus}`)
      console.log(`⚠️ This is likely due to the "keep only 2 active jobs" logic in jobProcessingService.ts`)
      
      // Just update the outputUuid to link the output to the job
      // Don't change the status or progress since it's already marked as failed
      await db
        .update(jobs)
        .set({
          outputUuid: mainOutput.uuid,
          updatedAt: new Date()
        })
        .where(eq(jobs.id, jobId))
      
      console.log(`✅ Updated job ${jobId} with output UUID while preserving failed status`)
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
    }
    
    // Update job counts for WebSocket clients after status change
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      console.error('Failed to update job counts after job completion:', error)
    }
    
    // Job triggering is now handled exclusively by the continuous processing interval
    // This prevents race conditions and ensures proper job sequencing
    console.log('🔄 COMPLETION: Continuous processing will handle next job automatically')
    
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
    console.error(`❌ Failed to process outputs for job ${jobId}:`, error)
    
    // Try to update the job status to failed with error message
    try {
      const { getDb } = await import('~/server/utils/database')
      const { jobs } = await import('~/server/utils/schema')
      const { eq } = await import('drizzle-orm')
      
      const db = getDb()
      
      // First check the current job status to avoid race conditions with the "keep only 2 active jobs" logic
      const currentJobStatus = await db
        .select({ status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1)
      
      if (currentJobStatus.length === 0) {
        console.log(`⚠️ Job ${jobId} not found when trying to update status to failed`)
      } else if (currentJobStatus[0].status === 'failed') {
        console.log(`⚠️ Job ${jobId} is already marked as failed - not updating error message`)
        console.log(`⚠️ This is likely due to the "keep only 2 active jobs" logic in jobProcessingService.ts`)
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
        
        console.log(`📝 Updated job ${jobId} status to failed`)
      }
      
      // Update job counts for WebSocket clients after status change
      try {
        const { updateJobCounts } = await import('~/server/services/systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        console.error('Failed to update job counts after job failure in catch block:', error)
      }
      
      // Job triggering is now handled exclusively by the continuous processing interval
      // This prevents race conditions and ensures proper job sequencing
      console.log('🔄 Job failed during processing - continuous processing will handle next job automatically')
      
    } catch (updateError) {
      console.error(`❌ Failed to update job ${jobId} status:`, updateError)
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