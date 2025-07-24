import { defineStore } from 'pinia'
import localforage from 'localforage'
import type { Job, QueueStatus, JobFilters } from '~/types'

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

  // Auto-refresh state
  const autoRefreshEnabled = ref(true)
  const autoRefreshInterval = ref<NodeJS.Timeout | null>(null)
  const REFRESH_INTERVAL = 5000 // 5 seconds
  
  const isProcessing = ref(false)
  
  // LocalForage key for auto-refresh setting
  const AUTO_REFRESH_KEY = 'jobs-auto-refresh-enabled'
  
  // Load auto-refresh setting from storage
  const loadAutoRefreshSetting = async () => {
    try {
      const saved = await localforage.getItem<boolean>(AUTO_REFRESH_KEY)
      if (saved !== null) {
        autoRefreshEnabled.value = saved
      }
    } catch (error) {
      console.error('❌ Failed to load auto-refresh setting:', error)
    }
  }
  
  // Save auto-refresh setting to storage
  const saveAutoRefreshSetting = async (enabled: boolean) => {
    try {
      await localforage.setItem(AUTO_REFRESH_KEY, enabled)
    } catch (error) {
      console.error('❌ Failed to save auto-refresh setting:', error)
    }
  }
  
  // Watch for changes to auto-refresh setting and save to storage
  watch(autoRefreshEnabled, async (newValue) => {
    await saveAutoRefreshSetting(newValue)
  })

  // Helper function to sort jobs with active jobs prioritized
  const sortJobsWithActivePriority = (jobsList: Job[]) => {
    return jobsList.sort((a, b) => {
      // First, prioritize active jobs
      if (a.status === 'active' && b.status !== 'active') {
        return -1 // a comes first
      }
      if (b.status === 'active' && a.status !== 'active') {
        return 1 // b comes first
      }
      
      // If both are active or both are not active, sort by updated_at (most recent first)
      const aUpdated = new Date(a.updated_at || a.created_at).getTime()
      const bUpdated = new Date(b.updated_at || b.created_at).getTime()
      return bUpdated - aUpdated
    })
  }

  // Actions
  const fetchQueueStatus = async () => {
    try {
      const response = await useApiFetch('jobs') as QueueStatus
      queueStatus.value = response
      
      // Update processing status from queue status
      if (response.queue && typeof response.queue.is_processing === 'boolean') {
        isProcessing.value = response.queue.is_processing
      }
    } catch (error) {
      console.error('❌ Failed to fetch queue status:', error)
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
    if (showLoading) {
      isLoading.value = true
    }

    // Store current pagination state for auto-refresh
    currentPage.value = page
    currentLimit.value = limit
    currentStatusFilter.value = statusFilter
    currentSubjectFilter.value = subjectFilter
    currentSourceTypeFilter.value = sourceTypeFilter

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

      const response = await useApiFetch(`jobs/search?${searchParams.toString()}`) as any

      // Handle different response formats from the API and only update after successful fetch
      let newJobs: Job[] = []
      let total = 0
      
      if (response.results) {
        newJobs = response.results as Job[]
        total = response.total_jobs_count || response.total || newJobs.length
      } else if (response.jobs) {
        newJobs = response.jobs as Job[]
        total = response.total_jobs_count || response.total || newJobs.length
      } else if (Array.isArray(response)) {
        newJobs = response as Job[]
        total = newJobs.length
      } else {
        newJobs = []
        total = 0
      }

      // Sort jobs to prioritize active jobs while maintaining updated_at order
      const sortedJobs = sortJobsWithActivePriority(newJobs)
      
      // Only replace jobs after successful fetch
      jobs.value = sortedJobs
      totalJobs.value = total
    } catch (error) {
      console.error('❌ Failed to fetch jobs:', error)
      // Don't clear jobs on error, keep existing data
    } finally {
      if (showLoading) {
        isLoading.value = false
      }
    }
  }

  const fetchInitialData = async () => {
    isLoading.value = true
    try {
      // Load auto-refresh setting first
      await loadAutoRefreshSetting()
      await fetchQueueStatus() // This now also updates processing status
      await fetchJobs()
      
      // Only start auto-refresh if it's enabled
      if (autoRefreshEnabled.value) {
        startAutoRefresh()
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

  // Auto-refresh methods
  const startAutoRefresh = () => {
    console.log('🚀 Starting auto-refresh...', { enabled: autoRefreshEnabled.value, interval: REFRESH_INTERVAL })
    
    if (autoRefreshInterval.value) {
      clearInterval(autoRefreshInterval.value)
    }
    
    if (autoRefreshEnabled.value) {
      autoRefreshInterval.value = setInterval(() => {
        // Only refresh if not currently loading and page is visible
        if (!isLoading.value && !document.hidden) {
          Promise.all([
            fetchJobs(false, currentPage.value, currentLimit.value, currentStatusFilter.value, currentSubjectFilter.value, currentSourceTypeFilter.value),
            fetchQueueStatus()
          ])
        }
      }, REFRESH_INTERVAL)
    }
  }

  const stopAutoRefresh = () => {
    if (autoRefreshInterval.value) {
      clearInterval(autoRefreshInterval.value)
      autoRefreshInterval.value = null
    }
  }

  const toggleAutoRefresh = (enabled?: boolean) => {
    // If enabled is passed, use it; otherwise use the current value
    const shouldEnable = enabled !== undefined ? enabled : autoRefreshEnabled.value
    
    // Always stop first to clear any existing interval
    stopAutoRefresh()
    
    if (shouldEnable) {
      startAutoRefresh()
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
        isProcessing.value = response.processing_enabled
      }
      
      return response
    } catch (error) {
      console.error('❌ Failed to get processing status:', error)
      throw error
    }
  }

  return {
    // State
    jobs: readonly(jobs),
    totalJobs: readonly(totalJobs),
    queueStatus: readonly(queueStatus),
    isLoading: readonly(isLoading),
    filters,
    autoRefreshEnabled,
    autoRefreshInterval: readonly(autoRefreshInterval),
    isProcessing: readonly(isProcessing),
    
    // Actions
    fetchJobs,
    fetchQueueStatus,
    fetchInitialData,
    refreshJobs,
    clearFilters,
    setFilter,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh,
    loadAutoRefreshSetting,
    saveAutoRefreshSetting,
    toggleProcessing,
    getProcessingStatus
  }
})