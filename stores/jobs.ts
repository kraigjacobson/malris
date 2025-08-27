import { defineStore } from 'pinia'
import type { Job, QueueStatus, JobFilters } from '~/types'
import type { SystemStatus, WebSocketMessage } from '~/types/systemStatus'

export const useJobsStore = defineStore('jobs', () => {
  // State
  const jobs = ref<Job[]>([]) // Just store all jobs directly
  const totalJobs = ref(0) // Total count for pagination
  const queueStatus = ref<QueueStatus | null>(null)
  const isLoading = ref(false)
  const filters = ref<JobFilters>({
    jobId: '',
    status: '',
    jobType: '',
    sourceType: 'all'
  })

  // Pagination state
  const currentPage = ref(1)
  const currentLimit = ref(20)
  const currentStatusFilter = ref('')
  const currentSubjectFilter = ref('')
  const currentSourceTypeFilter = ref('all')

  // WebSocket state
  const wsConnection = ref<WebSocket | null>(null)
  const wsConnected = ref(false)
  const wsReconnectAttempts = ref(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = ref(1000) // Start with 1 second
  
  // Enhanced system status
  const systemStatus = ref<SystemStatus | null>(null)
  const isProcessing = ref(false)
  
  // Manual processing state
  const isManualProcessing = ref(false)
  
  // Auto-refresh fallback (simplified)
  const autoRefreshInterval = ref<NodeJS.Timeout | null>(null)
  const REFRESH_INTERVAL = 5000 // 5 seconds


  // Actions
  const fetchQueueStatus = async () => {
    const startTime = performance.now()
    console.log(`📊 [QUEUE DEBUG] fetchQueueStatus started`)
    
    try {
      const response = await useApiFetch('jobs') as QueueStatus
      const apiTime = performance.now() - startTime
      console.log(`📊 [QUEUE DEBUG] API call completed in ${apiTime.toFixed(2)}ms`)
      
      queueStatus.value = response
      
      // Always update processing status from queue status - this is the authoritative source
      if (response.queue && typeof response.queue.is_processing === 'boolean') {
        const serverProcessingState = response.queue.is_processing
        if (isProcessing.value !== serverProcessingState) {
          console.log(`🔄 Processing state sync: ${isProcessing.value} → ${serverProcessingState}`)
        }
        isProcessing.value = serverProcessingState
      } else {
        console.warn('⚠️ Server response missing is_processing field:', response)
      }
      
      const totalTime = performance.now() - startTime
      console.log(`📊 [QUEUE DEBUG] fetchQueueStatus completed in ${totalTime.toFixed(2)}ms`)
    } catch (error) {
      const totalTime = performance.now() - startTime
      console.error(`❌ [QUEUE DEBUG] fetchQueueStatus failed after ${totalTime.toFixed(2)}ms:`, error)
      queueStatus.value = {
        queue: {
          total: 0,
          queued: 0,
          active: 0,
          completed: 0,
          failed: 0,
          canceled: 0,
          need_input: 0,
          is_paused: false,
          is_processing: false
        }
      }
      // Set processing to false on error
      isProcessing.value = false
    }
  }

  const fetchJobs = async (showLoading = false, page = 1, limit = 20, statusFilter = '', subjectFilter = '', sourceTypeFilter = 'all') => {
    const startTime = performance.now()
    console.log(`🔍 [JOBS DEBUG] fetchJobs started - status: "${statusFilter}", subject: "${subjectFilter}", sourceType: "${sourceTypeFilter}", page: ${page}, limit: ${limit}`)
    
    if (showLoading) {
      isLoading.value = true
    }

    try {
      const searchParams = new URLSearchParams()
      searchParams.append('limit', limit.toString())
      searchParams.append('offset', ((page - 1) * limit).toString())
      searchParams.append('sort_by', 'updated_at')
      searchParams.append('sort_order', 'desc')
      
      if (statusFilter) {
        searchParams.append('status', statusFilter)
      }
      
      if (subjectFilter) {
        searchParams.append('subject_uuid', subjectFilter)
      }
      
      if (sourceTypeFilter && sourceTypeFilter !== 'all') {
        searchParams.append('source_type', sourceTypeFilter)
      }

      const apiStartTime = performance.now()
      console.log(`🔍 [JOBS DEBUG] Making API call to: /api/jobs/search?${searchParams.toString()}`)
      
      const response = await useApiFetch(`jobs/search?${searchParams.toString()}`) as any
      const apiTime = performance.now() - apiStartTime
      console.log(`🔍 [JOBS DEBUG] API call completed successfully in ${apiTime.toFixed(2)}ms`)

      // Handle different response formats from the API
      let newJobs: Job[] = []
      let total = 0
      
      if (response.results) {
        newJobs = response.results as Job[]
        total = response.count || newJobs.length
      } else if (response.jobs) {
        newJobs = response.jobs as Job[]
        total = response.count || newJobs.length
      } else if (Array.isArray(response)) {
        newJobs = response as Job[]
        total = newJobs.length
      } else {
        newJobs = []
        total = 0
      }

      // Simple assignment - no caching, no complex state management
      jobs.value = newJobs
      totalJobs.value = total
      
      const totalTime = performance.now() - startTime
      console.log(`🔍 [JOBS DEBUG] fetchJobs completed in ${totalTime.toFixed(2)}ms - fetched ${newJobs.length} jobs`)
      
    } catch (error) {
      const totalTime = performance.now() - startTime
      console.error(`❌ [JOBS DEBUG] fetchJobs failed after ${totalTime.toFixed(2)}ms:`, error)
      
      // Clear jobs on error
      jobs.value = []
      totalJobs.value = 0
    } finally {
      if (showLoading) {
        isLoading.value = false
      }
    }
  }

  const fetchInitialData = async () => {
    isLoading.value = true
    try {
      // Just fetch queue status - jobs will be loaded when user clicks a filter
      await fetchQueueStatus()
      
      // WebSocket connection is now handled by the websocket plugin on app startup
      // Only start fallback polling if WebSocket is not connected
      if (!wsConnected.value) {
        startAutoRefresh() // Fallback polling
      }
    } finally {
      isLoading.value = false
    }
  }

  const refreshJobs = async (showLoading = false, page = 1, limit = 20, statusFilter = '', subjectFilter = '', sourceTypeFilter = 'all') => {
    await fetchJobs(showLoading, page, limit, statusFilter, subjectFilter, sourceTypeFilter)
  }

  const clearFilters = () => {
    filters.value = {
      jobId: '',
      status: '',
      jobType: '',
      sourceType: 'all'
    }
  }

  const setFilter = (key: keyof JobFilters, value: string) => {
    filters.value[key] = value
  }

  // WebSocket connection management with PWA persistence
  const connectWebSocket = () => {
    if (wsConnection.value?.readyState === WebSocket.OPEN) {
      console.log('🔌 WebSocket already connected')
      return
    }
    
    // Close any existing connection that's not open
    if (wsConnection.value && wsConnection.value.readyState !== WebSocket.OPEN) {
      wsConnection.value.close()
      wsConnection.value = null
    }
    
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/ws/status`
      
      console.log('🔌 Connecting to WebSocket:', wsUrl)
      wsConnection.value = new WebSocket(wsUrl)
      
      wsConnection.value.onopen = () => {
        console.log('✅ WebSocket connected')
        wsConnected.value = true
        wsReconnectAttempts.value = 0
        reconnectDelay.value = 1000
        
        // Stop polling when WebSocket is connected
        stopAutoRefresh()
      }
      
      wsConnection.value.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          handleWebSocketMessage(message)
        } catch (error) {
          console.error('❌ Failed to parse WebSocket message:', error)
        }
      }
      
      wsConnection.value.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason)
        wsConnected.value = false
        wsConnection.value = null
        
        // Start polling as fallback
        startAutoRefresh()
        
        // Aggressive reconnection for PWA - don't give up easily
        if (wsReconnectAttempts.value < maxReconnectAttempts) {
          wsReconnectAttempts.value++
          // Faster initial reconnection attempts for PWA
          const delay = wsReconnectAttempts.value === 1 ? 100 : reconnectDelay.value
          console.log(`🔄 PWA WebSocket reconnect ${wsReconnectAttempts.value}/${maxReconnectAttempts} in ${delay}ms`)
          
          setTimeout(() => {
            connectWebSocket()
          }, delay)
          
          // Exponential backoff but cap at 5 seconds for PWA
          reconnectDelay.value = Math.min(reconnectDelay.value * 1.5, 5000)
        } else {
          console.log('❌ Max WebSocket reconnect attempts reached, falling back to polling')
          // Reset attempts after 10 seconds for PWA (faster than before)
          setTimeout(() => {
            wsReconnectAttempts.value = 0
            reconnectDelay.value = 1000
          }, 10000)
        }
      }
      
      wsConnection.value.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
      }
      
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error)
      // Fall back to polling
      startAutoRefresh()
    }
  }
  
  const disconnectWebSocket = () => {
    if (wsConnection.value) {
      wsConnection.value.close()
      wsConnection.value = null
      wsConnected.value = false
    }
  }
  
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    const data = message.data as SystemStatus
    
    switch (message.type) {
      case 'status_update':
        // Full status update
        systemStatus.value = data
        updateLocalStateFromSystemStatus(data)
        break
        
      case 'runpod_status_change':
      case 'comfyui_status_change':
      case 'processing_status_change':
        // Partial status updates
        if (systemStatus.value) {
          systemStatus.value = { ...systemStatus.value, ...data }
          updateLocalStateFromSystemStatus(systemStatus.value)
        }
        break
        
      case 'auto_processing_toggle':
        // Auto processing status changed
        if (data.autoProcessing) {
          isProcessing.value = data.autoProcessing.status === 'enabled'
          console.log(`${isProcessing.value ? '▶️' : '⏸️'} Auto processing ${isProcessing.value ? 'enabled' : 'disabled'} via WebSocket`)
        }
        break
        
      case 'job_counts_update':
        // Job counts changed - update queue status only (no automatic job refresh)
        if (data.jobCounts) {
          // Update queue status with new counts
          queueStatus.value = {
            queue: {
              total: data.jobCounts.total,
              queued: data.jobCounts.queued,
              active: data.jobCounts.active,
              completed: data.jobCounts.completed,
              failed: data.jobCounts.failed,
              canceled: data.jobCounts.canceled,
              need_input: data.jobCounts.needInput,
              is_paused: systemStatus.value?.autoProcessing?.status !== 'enabled',
              is_processing: systemStatus.value?.autoProcessing?.status === 'enabled'
            }
          }
          
          // Don't automatically refresh job list - let user click filters to refresh
        }
        break
    }
  }
  
  const updateLocalStateFromSystemStatus = (status: SystemStatus) => {
    // Update processing state
    isProcessing.value = status.autoProcessing.status === 'enabled'
    
    // Update queue status
    queueStatus.value = {
      queue: {
        total: status.jobCounts.total,
        queued: status.jobCounts.queued,
        active: status.jobCounts.active,
        completed: status.jobCounts.completed,
        failed: status.jobCounts.failed,
        canceled: status.jobCounts.canceled,
        need_input: status.jobCounts.needInput,
        is_paused: status.autoProcessing.status !== 'enabled',
        is_processing: status.autoProcessing.status === 'enabled'
      }
    }
  }

  // Auto-refresh methods (simplified - only queue status)
  const startAutoRefresh = () => {
    // Don't start polling if WebSocket is connected
    if (wsConnected.value) {
      console.log('🔌 WebSocket connected, skipping auto-refresh')
      return
    }
    
    console.log('🚀 Starting auto-refresh fallback for queue status only...', { interval: REFRESH_INTERVAL })
    
    if (autoRefreshInterval.value) {
      clearInterval(autoRefreshInterval.value)
    }
    
    autoRefreshInterval.value = setInterval(() => {
      // Only refresh queue status if not currently loading and page is visible
      if (!isLoading.value && !document.hidden && !wsConnected.value) {
        fetchQueueStatus().catch(error => {
          console.error('❌ Auto-refresh failed:', error)
        })
      }
    }, REFRESH_INTERVAL)
  }

  const stopAutoRefresh = () => {
    if (autoRefreshInterval.value) {
      clearInterval(autoRefreshInterval.value)
      autoRefreshInterval.value = null
    }
  }


  // Processing methods (now server-side)
  const toggleProcessing = async () => {
    try {
      const response = await useApiFetch('jobs/processing/toggle', {
        method: 'POST',
        body: {
          enabled: !isProcessing.value
        }
      }) as any
      
      if (response.success) {
        isProcessing.value = response.processing_enabled
        console.log(`${isProcessing.value ? '▶️' : '⏸️'} Job processing ${isProcessing.value ? 'started' : 'stopped'}`)
      }
      
      return response
    } catch (error) {
      console.error('❌ Failed to toggle processing:', error)
      throw error
    }
  }

  const getProcessingStatus = async () => {
    try {
      const response = await useApiFetch('jobs/processing/status') as any
      
      if (response.success) {
        const serverProcessingState = response.processing_enabled
        if (isProcessing.value !== serverProcessingState) {
          console.log(`🔄 Processing status sync: ${isProcessing.value} → ${serverProcessingState}`)
        }
        isProcessing.value = serverProcessingState
      }
      
      return response
    } catch (error) {
      console.error('❌ Failed to get processing status:', error)
      throw error
    }
  }

  // Manual single job processing
  const processNextJob = async () => {
    try {
      isManualProcessing.value = true
      console.log('🎯 Processing next job manually...')
      const response = await useApiFetch('jobs/process-next', {
        method: 'POST'
      }) as any
      
      if (response.success) {
        console.log(`✅ Manual job processing successful: ${response.message}`)
        // Refresh jobs list to show the updated status
        await fetchJobs(false, currentPage.value, currentLimit.value, currentStatusFilter.value, currentSubjectFilter.value, currentSourceTypeFilter.value)
      } else if (response.skip) {
        console.log(`ℹ️ No job to process: ${response.message}`)
      }
      
      return response
    } catch (error) {
      console.error('❌ Failed to process next job:', error)
      throw error
    } finally {
      isManualProcessing.value = false
    }
  }

  // Cleanup on unmount
  const cleanup = () => {
    stopAutoRefresh()
    disconnectWebSocket()
  }

  return {
    // State
    jobs: readonly(jobs),
    totalJobs: readonly(totalJobs),
    queueStatus: readonly(queueStatus),
    isLoading: readonly(isLoading),
    filters,
    isProcessing: readonly(isProcessing),
    isManualProcessing: readonly(isManualProcessing),
    
    // WebSocket state
    wsConnected: readonly(wsConnected),
    systemStatus: readonly(systemStatus),
    
    // Actions
    fetchJobs,
    fetchQueueStatus,
    fetchInitialData,
    refreshJobs,
    clearFilters,
    setFilter,
    toggleProcessing,
    getProcessingStatus,
    processNextJob,
    
    // WebSocket actions
    connectWebSocket,
    disconnectWebSocket,
    cleanup
  }
})