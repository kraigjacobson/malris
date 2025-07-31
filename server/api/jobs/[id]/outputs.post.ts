/**
 * Receive job outputs from comfyui-runpod-worker
 * This endpoint handles the completion of jobs and stores the output media
 */
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
      destMediaUuid: jobs.destMediaUuid
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
    let totalFiles = null
    let fileIndex = null
    
    const metadataFields = formData.filter(field => !field.filename)
    for (const field of metadataFields) {
      const fieldName = field.name
      const fieldValue = field.data.toString()
      
      if (fieldName === 'purpose') {
        purpose = fieldValue
      } else if (fieldName === 'error_message') {
        errorMessage = fieldValue
      } else if (fieldName === 'source_media_uuid') {
        sourceMediaUuid = fieldValue
        console.log(`🔗 DETAILED SOURCE UUID DEBUG: Received source media UUID for output linking: ${sourceMediaUuid}`)
        console.log(`🔍 FORM DATA CONTEXT:`, {
          fieldName,
          fieldValue,
          purpose,
          totalFiles,
          fileIndex,
          allMetadataFields: metadataFields.map(f => ({ name: f.name, value: f.data.toString() }))
        })
      } else if (fieldName === 'total_files') {
        totalFiles = parseInt(fieldValue)
        console.log(`📊 Expected total files for job ${jobId}: ${totalFiles}`)
      } else if (fieldName === 'file_index') {
        fileIndex = parseInt(fieldValue)
        console.log(`📁 Received file ${fileIndex + 1}/${totalFiles || '?'} for job ${jobId}`)
      }
    }
    
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
      
      // Trigger processing of next job immediately after marking this one as failed
      try {
        const { getProcessingStatus } = await import('~/server/services/jobProcessingService')
        const isProcessingEnabled = getProcessingStatus()
        
        if (isProcessingEnabled) {
          console.log('🔄 Job failed - triggering immediate processing of next job')
          const { processNextJob } = await import('~/server/services/jobProcessingService')
          // Process next job asynchronously (don't wait for it)
          processNextJob().then(result => {
            if (result.success) {
              console.log(`✅ Successfully started next job after failure: ${result.job_id}`)
            } else if (!result.skip) {
              console.log(`⚠️ Failed to start next job after failure: ${result.message}`)
            }
          }).catch(error => {
            console.error('❌ Error processing next job after failure:', error)
          })
        }
      } catch (triggerError) {
        console.error('❌ Error triggering next job processing:', triggerError)
        // Don't fail the error reporting if we can't trigger next job
      }
      
      return {
        success: true,
        message: `Job ${jobId} marked as failed`,
        error: errorMessage
      }
    }
    
    // Process output files (only for regular jobs)
    const files = formData.filter(field => field.filename)
    const savedMedia = []
    
    // Categorize files by type
    const videoFiles = []
    const imageFiles = []
    
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
    
    console.log(`📁 Found ${videoFiles.length} video files and ${imageFiles.length} image files`)
    
    // If we have video files, clean up any existing output images for this job first
    if (videoFiles.length > 0) {
      try {
        const { and } = await import('drizzle-orm')
        const existingImages = await db.select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename
        }).from(mediaRecords).where(
          and(
            eq(mediaRecords.jobId, jobId),
            eq(mediaRecords.purpose, 'output'),
            eq(mediaRecords.type, 'image')
          )
        )
        
        if (existingImages.length > 0) {
          console.log(`🧹 Cleaning up ${existingImages.length} existing output images for job ${jobId}`)
          
          await db.delete(mediaRecords).where(
            and(
              eq(mediaRecords.jobId, jobId),
              eq(mediaRecords.purpose, 'output'),
              eq(mediaRecords.type, 'image')
            )
          )
          
          console.log(`✅ Cleaned up existing images: ${existingImages.map(img => img.filename).join(', ')}`)
        }
      } catch (cleanupError) {
        console.error(`⚠️ Failed to cleanup existing images for job ${jobId}:`, cleanupError)
        // Don't fail the job if cleanup fails
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
    for (const file of imageFiles) {
      console.log(`🖼️ Processing image file: ${file.filename} (${file.data.length} bytes)`)
      
      // Calculate checksum of the original file data
      const { createHash } = await import('crypto')
      const checksum = createHash('sha256').update(file.data).digest('hex')
      
      // Encrypt the file data using Fernet encryption
      const { encryptMediaData } = await import('~/server/utils/encryption')
      const encryptedData = encryptMediaData(file.data, encryptionKey)
      
      // Determine purpose based on whether we have videos
      const imagePurpose = videoFiles.length > 0 ? 'thumbnail' : 'output'
      const imageType = 'image'
      
      console.log(`💾 CREATING IMAGE MEDIA RECORD:`, {
        filename: file.filename || 'thumbnail.png',
        type: imageType,
        purpose: imagePurpose,
        subjectUuid: job?.subjectUuid || null,
        destMediaUuidRef: job?.destMediaUuid || null,
        sourceMediaUuidRef: sourceMediaUuid || null,
        fileSize: file.data.length,
        jobId: jobId,
        fileIndex,
        totalFiles
      })
      
      // Check if a record already exists for this EXACT job, source UUID and subject UUID combination
      let mediaRecord
      if (sourceMediaUuid && job?.subjectUuid) {
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
            eq(mediaRecords.purpose, imagePurpose),
            eq(mediaRecords.type, imageType)
          )
        ).limit(1)

        if (existingRecord.length > 0) {
          // Update existing record (only from the same job)
          console.log(`🔄 Updating existing media record for job ${jobId}, source ${sourceMediaUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db.update(mediaRecords)
            .set({
              filename: file.filename || 'thumbnail.png',
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
          console.log(`✨ Creating NEW media record for job ${jobId}, source ${sourceMediaUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db.insert(mediaRecords).values({
            filename: file.filename || 'thumbnail.png',
            type: imageType,
            purpose: imagePurpose,
            subjectUuid: job?.subjectUuid || null,
            destMediaUuidRef: job?.destMediaUuid || null,
            sourceMediaUuidRef: sourceMediaUuid || null, // Link to source subject image
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
      } else {
        // Create new record (fallback for cases without source UUID)
        mediaRecord = await db.insert(mediaRecords).values({
          filename: file.filename || 'thumbnail.png',
          type: imageType,
          purpose: imagePurpose,
          subjectUuid: job?.subjectUuid || null,
          destMediaUuidRef: job?.destMediaUuid || null,
          sourceMediaUuidRef: sourceMediaUuid || null, // Link to source subject image
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
      
      const imageRecord = mediaRecord[0]
      savedMedia.push(imageRecord)
      
      if (imagePurpose === 'thumbnail') {
        thumbnailRecord = imageRecord
        console.log(`✅ Saved thumbnail: ${imageRecord.uuid}`)
      } else {
        console.log(`✅ Saved image: ${imageRecord.uuid}`)
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
      
      console.log(`💾 CREATING VIDEO MEDIA RECORD:`, {
        filename: file.filename || 'output.mp4',
        type: 'video',
        purpose: purpose,
        subjectUuid: job?.subjectUuid || null,
        destMediaUuidRef: job?.destMediaUuid || null,
        sourceMediaUuidRef: sourceMediaUuid || null,
        thumbnailUuid: thumbnailRecord?.uuid || null,
        fileSize: file.data.length,
        jobId: jobId,
        fileIndex,
        totalFiles
      })
      
      // Check if a record already exists for this EXACT job, source UUID and subject UUID combination
      let mediaRecord
      if (sourceMediaUuid && job?.subjectUuid) {
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
          console.log(`🔄 Updating existing video media record for job ${jobId}, source ${sourceMediaUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db.update(mediaRecords)
            .set({
              filename: file.filename || 'output.mp4',
              thumbnailUuid: thumbnailRecord?.uuid || null,
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
          console.log(`✨ Creating NEW video media record for job ${jobId}, source ${sourceMediaUuid} and subject ${job.subjectUuid}`)
          mediaRecord = await db.insert(mediaRecords).values({
            filename: file.filename || 'output.mp4',
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
            jobId: jobId
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
          filename: file.filename || 'output.mp4',
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
          jobId: jobId
        }).returning({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename,
          type: mediaRecords.type,
          sourceMediaUuidRef: mediaRecords.sourceMediaUuidRef
        })
      }
      
      const videoRecord = mediaRecord[0]
      savedMedia.push(videoRecord)
      console.log(`✅ Saved video: ${videoRecord.uuid}${thumbnailRecord ? ` with thumbnail ${thumbnailRecord.uuid}` : ''}`)
      
      // Update thumbnail record to reference the video
      if (thumbnailRecord) {
        await db
          .update(mediaRecords)
          .set({
            updatedAt: new Date()
          })
          .where(eq(mediaRecords.uuid, thumbnailRecord.uuid))
        
        console.log(`🔗 Linked thumbnail ${thumbnailRecord.uuid} to video ${videoRecord.uuid}`)
      }
    }
    
    if (savedMedia.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No valid files were processed'
      })
    }
    
    // Check if we need to wait for more files before completing the job
    let shouldCompleteJob = true
    let isLastFile = false
    
    if (totalFiles !== null && fileIndex !== null) {
      // We have file tracking information - check if this is the last file
      isLastFile = (fileIndex === totalFiles - 1)
      shouldCompleteJob = isLastFile
      
      if (!isLastFile) {
        console.log(`📁 Received file ${fileIndex + 1}/${totalFiles} for job ${jobId} - waiting for remaining files`)
        
        // Return success but don't complete the job yet
        return {
          success: true,
          message: `Received file ${fileIndex + 1}/${totalFiles} for job ${jobId}`,
          job_id: jobId,
          status: 'processing',
          files_received: fileIndex + 1,
          total_files: totalFiles,
          waiting_for_more: true
        }
      } else {
        console.log(`📁 Received final file ${fileIndex + 1}/${totalFiles} for job ${jobId} - completing job`)
      }
    }
    
    // Determine job status based on output type
    // If we received images instead of expected video, mark as need_input
    const hasImages = savedMedia.some(media => media.type === 'image')
    const hasVideos = savedMedia.some(media => media.type === 'video')
    
    let jobStatus: 'completed' | 'need_input' = 'completed'
    let statusMessage = `Job ${jobId} completed successfully`
    
    // If we only got images and no videos, this likely means the job needs input (test workflow)
    if (hasImages && !hasVideos) {
      jobStatus = 'need_input'
      statusMessage = `Job ${jobId} produced images - needs additional input for video generation`
      console.log(`🔄 Job ${jobId} marked as need_input - received ${savedMedia.length} images instead of video`)
    } else {
      console.log(`✅ Job ${jobId} completed successfully with ${savedMedia.length} output files`)
    }
    
    // Update job with output UUID (use the video if available, otherwise first output)
    const mainOutput = savedMedia.find(media => media.type === 'video') || savedMedia[0]
    await db
      .update(jobs)
      .set({
        status: jobStatus,
        outputUuid: mainOutput.uuid,
        progress: jobStatus === 'completed' ? 100 : 75, // 75% if need_input, 100% if completed
        completedAt: jobStatus === 'completed' ? new Date() : null,
        errorMessage: null, // Clear any previous error messages on successful completion
        updatedAt: new Date()
      })
      .where(eq(jobs.id, jobId))
    
    // Update job counts for WebSocket clients after status change
    try {
      const { updateJobCounts } = await import('~/server/services/systemStatusManager')
      await updateJobCounts()
    } catch (error) {
      console.error('Failed to update job counts after job completion:', error)
    }
    
    // Only trigger next job processing if this is the final file or no file tracking
    if (shouldCompleteJob) {
      // Trigger processing of next job immediately after successful completion
      try {
        const { getProcessingStatus } = await import('~/server/services/jobProcessingService')
        const isProcessingEnabled = getProcessingStatus()
        
        if (isProcessingEnabled) {
          console.log('🔄 Job completed - triggering immediate processing of next job')
          const { processNextJob } = await import('~/server/services/jobProcessingService')
          // Process next job asynchronously (don't wait for it)
          processNextJob().then(result => {
            if (result.success) {
              console.log(`✅ Successfully started next job after completion: ${result.job_id}`)
            } else if (!result.skip) {
              console.log(`⚠️ Failed to start next job after completion: ${result.message}`)
            }
          }).catch(error => {
            console.error('❌ Error processing next job after completion:', error)
          })
        }
      } catch (triggerError) {
        console.error('❌ Error triggering next job processing:', triggerError)
        // Don't fail the completion if we can't trigger next job
      }
    }
    
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
      ...(totalFiles !== null && {
        files_received: (fileIndex || 0) + 1,
        total_files: totalFiles,
        is_final_file: isLastFile
      })
    }
    
  } catch (error: any) {
    console.error(`❌ Failed to process outputs for job ${jobId}:`, error)
    
    // Try to update the job status to failed with error message
    try {
      const { getDb } = await import('~/server/utils/database')
      const { jobs } = await import('~/server/utils/schema')
      const { eq } = await import('drizzle-orm')
      
      const db = getDb()
      
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
      
      // Update job counts for WebSocket clients after status change
      try {
        const { updateJobCounts } = await import('~/server/services/systemStatusManager')
        await updateJobCounts()
      } catch (error) {
        console.error('Failed to update job counts after job failure in catch block:', error)
      }
      
      // Trigger processing of next job immediately after marking this one as failed
      try {
        const { getProcessingStatus } = await import('~/server/services/jobProcessingService')
        const isProcessingEnabled = getProcessingStatus()
        
        if (isProcessingEnabled) {
          console.log('🔄 Job failed during processing - triggering immediate processing of next job')
          const { processNextJob } = await import('~/server/services/jobProcessingService')
          // Process next job asynchronously (don't wait for it)
          processNextJob().then(result => {
            if (result.success) {
              console.log(`✅ Successfully started next job after processing failure: ${result.job_id}`)
            } else if (!result.skip) {
              console.log(`⚠️ Failed to start next job after processing failure: ${result.message}`)
            }
          }).catch(error => {
            console.error('❌ Error processing next job after processing failure:', error)
          })
        }
      } catch (triggerError) {
        console.error('❌ Error triggering next job processing after failure:', triggerError)
        // Don't fail the error reporting if we can't trigger next job
      }
      
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