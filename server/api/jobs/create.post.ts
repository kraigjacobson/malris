/**
 * Create a new job and add it to the queue
 * Replaces the FastAPI /jobs POST route
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { 
      job_type, 
      subject_uuid, 
      dest_media_uuid, 
      source_media_uuid, 
      frames_per_batch, 
      parameters 
    } = body
    
    // Validate required fields
    if (!job_type) {
      throw createError({
        statusCode: 400,
        statusMessage: "job_type is required"
      })
    }
    
    if (!subject_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: "subject_uuid is required"
      })
    }
    
    if (!dest_media_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: "dest_media_uuid is required"
      })
    }
    
    // Validate job type - only allow vid_faceswap
    if (job_type !== "vid_faceswap") {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid job type '${job_type}'. Only 'vid_faceswap' is supported.`
      })
    }
    
    const { getDbClient } = await import('~/server/utils/database')
    const client = await getDbClient()
    
    try {
      // Verify subject exists
      const subjectQuery = 'SELECT id FROM subjects WHERE id = $1'
      const subjectResult = await client.query(subjectQuery, [subject_uuid])
      
      if (subjectResult.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Subject not found"
        })
      }
      
      // Verify dest media exists
      const destMediaQuery = 'SELECT uuid FROM media_records WHERE uuid = $1'
      const destMediaResult = await client.query(destMediaQuery, [dest_media_uuid])
      
      if (destMediaResult.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Destination media not found"
        })
      }
      
      // Verify source media exists if provided
      if (source_media_uuid) {
        const sourceMediaQuery = 'SELECT uuid FROM media_records WHERE uuid = $1'
        const sourceMediaResult = await client.query(sourceMediaQuery, [source_media_uuid])
        
        if (sourceMediaResult.rows.length === 0) {
          throw createError({
            statusCode: 404,
            statusMessage: "Source media not found"
          })
        }
      }
      
      // Parse parameters
      let params: any = {}
      if (parameters) {
        if (typeof parameters === 'string') {
          try {
            params = JSON.parse(parameters)
          } catch (error: any) {
            console.error("error", error)
            throw createError({
              statusCode: 400,
              statusMessage: "Invalid parameters JSON"
            })
          }
        } else {
          params = parameters
        }
      }
      
      // Add frames_per_batch to parameters if provided
      if (frames_per_batch !== undefined) {
        params.frames_per_batch = frames_per_batch
      }
      
      // Create job
      const insertQuery = `
        INSERT INTO jobs (
          job_type, 
          subject_uuid, 
          dest_media_uuid, 
          source_media_uuid, 
          parameters, 
          status, 
          progress,
          created_at, 
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'queued', 0, NOW(), NOW())
        RETURNING id, job_type, status, created_at
      `
      
      const paramsJson = Object.keys(params).length > 0 ? JSON.stringify(params) : null
      const result = await client.query(insertQuery, [
        job_type,
        subject_uuid,
        dest_media_uuid,
        source_media_uuid || null,
        paramsJson
      ])
      
      const newJob = result.rows[0]
      
      return {
        success: true,
        job_id: newJob.id,
        job_type: newJob.job_type,
        status: newJob.status,
        workflow_type: source_media_uuid ? "vid" : "test",
        created_at: newJob.created_at,
        message: "Job created successfully"
      }
      
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create job: ${error.message || 'Unknown error'}`
    })
  }
})