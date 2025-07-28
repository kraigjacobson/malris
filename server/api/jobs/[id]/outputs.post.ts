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
        console.log(`🔗 Received source media UUID for output linking: ${sourceMediaUuid}`)
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
      
      // Create image media record
      const mediaRecord = await db.insert(mediaRecords).values({
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
        type: mediaRecords.type
      })
      
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
      
      // Create video media record with thumbnail reference
      const mediaRecord = await db.insert(mediaRecords).values({
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
        type: mediaRecords.type
      })
      
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
    
    return {
      success: true,
      message: statusMessage,
      job_id: jobId,
      status: jobStatus,
      output_files: savedMedia.map(media => ({
        uuid: media.uuid,
        filename: media.filename,
        type: media.type
      }))
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