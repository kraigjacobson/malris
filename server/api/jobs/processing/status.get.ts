/**
 * Get current job processing status
 */

export default defineEventHandler(async (_event) => {
  try {
    // Get processing status directly from the toggle module - no HTTP calls needed!
    const { getProcessingStatus } = await import('~/server/api/jobs/processing/toggle.post')
    const processingEnabled = getProcessingStatus()
    
    return {
      success: true,
      processing_enabled: processingEnabled
    }
    
  } catch (error: any) {
    console.error('❌ Failed to get processing status:', error)
    
    return {
      success: false,
      processing_enabled: false,
      error: error.message || 'Unknown error'
    }
  }
})