import { defineStore } from 'pinia'

interface Job {
  id: string
  status: string
  job_type: string
  progress?: number
  created_at: string
  completed_at?: string
  source_media_uuid: string
  output_uuid?: string
  parameters?: any
  error_message?: string
}

interface QueueStatus {
  queue: {
    total: number
    queued: number
    active: number
    completed: number
    failed: number
    cancelled: number
    need_input: number
    is_paused: boolean
  }
}

interface JobFilters {
  jobId: string
  status: string
  jobType: string
}

export const useJobsStore = defineStore('jobs', () => {
  // State
  const jobs = ref<Job[]>([]) // Just store all jobs directly
  const queueStatus = ref<QueueStatus | null>(null)
  const isLoading = ref(false)
  const filters = ref<JobFilters>({
    jobId: '',
    status: '',
    jobType: ''
  })

  // Auto-refresh state
  const autoRefreshEnabled = ref(true)
  const autoRefreshInterval = ref<NodeJS.Timeout | null>(null)
  const REFRESH_INTERVAL = 5000 // 5 seconds

  // Actions
  const fetchQueueStatus = async () => {
    try {
      const response = await useAuthFetch('jobs') as QueueStatus
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
          cancelled: 0,
          need_input: 0,
          is_paused: false
        }
      }
    }
  }

  const fetchJobs = async (showLoading = false) => {
    if (showLoading) {
      isLoading.value = true
    }

    try {
      console.log('🔄 Fetching all jobs...')
      const searchParams = new URLSearchParams()
      searchParams.append('limit', '100') // Get all jobs, no server-side filtering

      const response = await useAuthFetch(`jobs/search?${searchParams.toString()}`) as any

      // Handle different response formats from the API and only update after successful fetch
      let newJobs: Job[] = []
      if (response.results) {
        newJobs = response.results as Job[]
        console.log(`✅ Fetched ${response.results.length} jobs`)
      } else if (response.jobs) {
        newJobs = response.jobs as Job[]
        console.log(`✅ Fetched ${response.jobs.length} jobs`)
      } else if (Array.isArray(response)) {
        newJobs = response as Job[]
        console.log(`✅ Fetched ${response.length} jobs`)
      } else {
        newJobs = []
        console.log('✅ No jobs found')
      }

      // Only replace jobs after successful fetch
      jobs.value = newJobs
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
      await fetchQueueStatus()
      await fetchJobs()
    } finally {
      isLoading.value = false
    }
  }

  const refreshJobs = async (showLoading = false) => {
    await fetchJobs(showLoading)
  }

  const applyFilters = () => {
    // No need to fetch - filtering is done client-side via computed property
    console.log('🔍 Applying client-side filters:', filters.value)
  }

  const clearFilters = () => {
    filters.value = {
      jobId: '',
      status: '',
      jobType: ''
    }
    console.log('🧹 Cleared all filters')
  }

  const setFilter = (key: keyof JobFilters, value: string) => {
    console.log(`🎯 Setting filter ${key} = '${value}'`)
    filters.value[key] = value
    console.log('📋 Current filters:', filters.value)
  }

  // Auto-refresh methods
  const startAutoRefresh = () => {
    console.log('🚀 Starting auto-refresh...', { enabled: autoRefreshEnabled.value, interval: REFRESH_INTERVAL })
    
    if (autoRefreshInterval.value) {
      clearInterval(autoRefreshInterval.value)
      console.log('🧹 Cleared existing interval')
    }
    
    if (autoRefreshEnabled.value) {
      autoRefreshInterval.value = setInterval(() => {
        console.log('⏰ Auto-refresh timer triggered', { isLoading: isLoading.value, hidden: document.hidden })
        // Only refresh if not currently loading and page is visible
        if (!isLoading.value && !document.hidden) {
          fetchJobs()
        } else {
          console.log('⏸️ Skipping auto-refresh (loading or hidden)')
        }
      }, REFRESH_INTERVAL)
      console.log('✅ Auto-refresh interval started')
    } else {
      console.log('❌ Auto-refresh disabled')
    }
  }

  const stopAutoRefresh = () => {
    if (autoRefreshInterval.value) {
      clearInterval(autoRefreshInterval.value)
      autoRefreshInterval.value = null
    }
  }

  const toggleAutoRefresh = () => {
    if (autoRefreshEnabled.value) {
      startAutoRefresh()
    } else {
      stopAutoRefresh()
    }
  }

  return {
    // State
    jobs: readonly(jobs),
    queueStatus: readonly(queueStatus),
    isLoading: readonly(isLoading),
    filters,
    autoRefreshEnabled,
    autoRefreshInterval: readonly(autoRefreshInterval),
    
    // Actions
    fetchInitialData,
    refreshJobs,
    applyFilters,
    clearFilters,
    setFilter,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh
  }
})