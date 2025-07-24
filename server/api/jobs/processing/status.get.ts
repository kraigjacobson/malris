/**
 * Get current job processing status
 */

export default defineEventHandler(async (_event) => {
  try {
    // Since we can't directly access the private variable, we'll call the toggle endpoint
    // with no body to get the current status
    const { getComfyApiBaseUrl } = await import('~/server/utils/api-url')
    const baseUrl = getComfyApiBaseUrl()
    const response = await fetch(`${baseUrl}/api/jobs/processing/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    
    const result = await response.json()
    
    return {
      success: true,
      processing_enabled: result.processing_enabled
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