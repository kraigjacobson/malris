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
    
    // Get the job to verify it exists and is active
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
    let mediaType = 'video'
    let errorMessage = null
    
    const metadataFields = formData.filter(field => !field.filename)
    for (const field of metadataFields) {
      const fieldName = field.name
      const fieldValue = field.data.toString()
      
      if (fieldName === 'purpose') {
        purpose = fieldValue
      } else if (fieldName === 'media_type') {
        mediaType = fieldValue
      } else if (fieldName === 'error_message') {
        errorMessage = fieldValue
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
    
    // Process output files
    const files = formData.filter(field => field.filename)
    const savedMedia = []
    
    for (const file of files) {
      if (!file.data || file.data.length === 0) {
        console.log(`⚠️ Skipping empty file: ${file.filename}`)
        continue
      }
      
      console.log(`💾 Processing output file: ${file.filename} (${file.data.length} bytes)`)
      
      // Get encryption key from environment
      const encryptionKey = process.env.MEDIA_ENCRYPTION_KEY
      if (!encryptionKey) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Media encryption not configured'
        })
      }
      
      // Calculate checksum of the original file data
      const { createHash } = await import('crypto')
      const checksum = createHash('sha256').update(file.data).digest('hex')
      
      // Encrypt the file data using Fernet encryption
      const { encryptMediaData } = await import('~/server/utils/encryption')
      const encryptedData = encryptMediaData(file.data, encryptionKey)
      
      // Create media record
      const mediaRecord = await db.insert(mediaRecords).values({
        filename: file.filename || 'output.mp4',
        type: mediaType,
        purpose: purpose,
        subjectUuid: job.subjectUuid,
        destMediaUuidRef: job.destMediaUuid, // Add the destination media UUID reference
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
      
      savedMedia.push(mediaRecord[0])
      console.log(`✅ Saved output media: ${mediaRecord[0].uuid}`)
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
    
    // If we only got images and no videos, this likely means the job needs input
    if (hasImages && !hasVideos) {
      jobStatus = 'need_input'
      statusMessage = `Job ${jobId} produced images - needs additional input for video generation`
      console.log(`🔄 Job ${jobId} marked as need_input - received ${savedMedia.length} images instead of video`)
    } else {
      console.log(`✅ Job ${jobId} completed successfully with ${savedMedia.length} output files`)
      
      // Clean up intermediate output images when job completes with video
      try {
        const { and } = await import('drizzle-orm')
        const intermediateImages = await db.select({
          uuid: mediaRecords.uuid,
          filename: mediaRecords.filename
        }).from(mediaRecords).where(
          and(
            eq(mediaRecords.jobId, jobId),
            eq(mediaRecords.purpose, 'output'),
            eq(mediaRecords.type, 'image')
          )
        )
        
        if (intermediateImages.length > 0) {
          console.log(`🧹 Cleaning up ${intermediateImages.length} intermediate output images for job ${jobId}`)
          
          // Delete the intermediate images from database
          await db.delete(mediaRecords).where(
            and(
              eq(mediaRecords.jobId, jobId),
              eq(mediaRecords.purpose, 'output'),
              eq(mediaRecords.type, 'image')
            )
          )
          
          console.log(`✅ Cleaned up intermediate images: ${intermediateImages.map(img => img.filename).join(', ')}`)
        }
      } catch (cleanupError) {
        console.error(`⚠️ Failed to cleanup intermediate images for job ${jobId}:`, cleanupError)
        // Don't fail the job completion if cleanup fails
      }
    }
    
    // Update job with output UUID (use the first/main output file)
    const mainOutput = savedMedia[0]
    await db
      .update(jobs)
      .set({
        status: jobStatus,
        outputUuid: mainOutput.uuid,
        progress: jobStatus === 'completed' ? 100 : 75, // 75% if need_input, 100% if completed
        completedAt: jobStatus === 'completed' ? new Date() : null,
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