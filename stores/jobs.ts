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
    jobType: ''
  })

  // Pagination state
  const currentPage = ref(1)
  const currentLimit = ref(20)
  const currentStatusFilter = ref('')
  const currentSubjectFilter = ref('')

  // Auto-refresh state
  const autoRefreshEnabled = ref(true)
  const autoRefreshInterval = ref<NodeJS.Timeout | null>(null)
  const REFRESH_INTERVAL = 5000 // 5 seconds
  
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

  // Actions
  const fetchQueueStatus = async () => {
    try {
      const response = await useApiFetch('jobs') as QueueStatus
      queueStatus.value = response
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
          is_paused: false
        }
      }
    }
  }

  const fetchJobs = async (showLoading = false, page = 1, limit = 20, statusFilter = '', subjectFilter = '') => {
    if (showLoading) {
      isLoading.value = true
    }

    // Store current pagination state for auto-refresh
    currentPage.value = page
    currentLimit.value = limit
    currentStatusFilter.value = statusFilter
    currentSubjectFilter.value = subjectFilter

    try {
      const searchParams = new URLSearchParams()
      searchParams.append('limit', limit.toString())
      searchParams.append('offset', ((page - 1) * limit).toString())
      searchParams.append('order_by', 'updated_at')
      searchParams.append('order_direction', 'desc')
      
      if (statusFilter) {
        searchParams.append('status', statusFilter)
      }
      
      if (subjectFilter) {
        searchParams.append('subject_uuid', subjectFilter)
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

      // Only replace jobs after successful fetch
      jobs.value = newJobs
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
      await fetchQueueStatus()
      await fetchJobs()
      
      // Only start auto-refresh if it's enabled
      if (autoRefreshEnabled.value) {
        startAutoRefresh()
      }
    } finally {
      isLoading.value = false
    }
  }

  const refreshJobs = async (showLoading = false, page = 1, limit = 20, statusFilter = '', subjectFilter = '') => {
    await fetchJobs(showLoading, page, limit, statusFilter, subjectFilter)
  }

  const clearFilters = () => {
    filters.value = {
      jobId: '',
      status: '',
      jobType: ''
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
          fetchJobs(false, currentPage.value, currentLimit.value, currentStatusFilter.value, currentSubjectFilter.value)
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
    console.log('🔄 Toggling auto-refresh:', { enabled: shouldEnable, current: autoRefreshEnabled.value })
    
    // Always stop first to clear any existing interval
    stopAutoRefresh()
    
    if (shouldEnable) {
      startAutoRefresh()
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
    saveAutoRefreshSetting
  }
})