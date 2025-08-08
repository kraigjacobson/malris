/**
 * Single Job Processing Endpoint
 * Processes one job only, then stops
 */

import { startSingleJob } from '~/server/services/jobProcessingService'
import { logger } from '~/server/utils/logger'

export default defineEventHandler(async (_event) => {
  try {
    const result = await startSingleJob()
    
    if (result.success) {
      return {
        success: true,
        message: result.message || 'Job processed successfully',
        job_id: (result as any).job_id,
        status: (result as any).status
      }
    } else {
      return {
        success: false,
        message: result.message || 'Job processing failed',
        skip: (result as any).skip
      }
    }
    
  } catch (error: any) {
    logger.error('❌ Single job processing failed:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Single job processing failed: ${error.message || 'Unknown error'}`
    })
  }
})