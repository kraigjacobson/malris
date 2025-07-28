<template>
  <div class="container mx-auto p-3 sm:p-6">
    <div class="mb-4 sm:mb-8">
      <h1 class="text-md sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
        Jobs
      </h1>
    </div>

    <!-- Queue Status Card -->
    <UCard class="mb-3 sm:mb-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            Queue Status
          </h2>
          <div class="flex items-center gap-1 sm:gap-2">
            <!-- Play/Pause Toggle -->
            <UButton
              type="button"
              size="xs"
              :variant="jobsStore.isProcessing ? 'solid' : 'outline'"
              :color="jobsStore.isProcessing ? 'red' : 'green'"
              @click.prevent="jobsStore.toggleProcessing()"
              :disabled="jobsStore.isLoading"
            >
              <UIcon
                :name="jobsStore.isProcessing ? 'i-heroicons-pause' : 'i-heroicons-play'"
                class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2"
              />
              <span class="hidden sm:inline">{{ jobsStore.isProcessing ? 'Pause' : 'Play' }}</span>
            </UButton>
            
            <USwitch
              v-model="jobsStore.autoRefreshEnabled"
              :disabled="jobsStore.isLoading"
              @update:model-value="(value) => jobsStore.toggleAutoRefresh(value)"
            />
            <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1 hidden sm:flex">
              Auto-refresh {{ jobsStore.autoRefreshEnabled ? 'ON' : 'OFF' }}
            </span>
            <UButton
              type="button"
              size="xs"
              variant="outline"
              @click.prevent="() => refreshJobsWithCurrentState()"
            >
              <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" :class="{ 'animate-spin': jobsStore.isLoading }" />
              <span class="hidden sm:inline">Refresh</span>
            </UButton>
          </div>
        </div>
      </template>

      <!-- Mobile: Compact grid layout with more buttons per row -->
      <div class="grid grid-cols-4 gap-1 sm:hidden">
        <div
          class="text-center p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          :class="{ 'border-2 border-blue-500': jobsStore.filters.status === '' }"
          @click="filterByStatus('')"
        >
          <div class="text-sm font-bold text-blue-600 dark:text-blue-400">
            {{ jobsStore.queueStatus?.queue?.total || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Total</div>
        </div>
        <div
          class="text-center p-1.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-md cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
          :class="{ 'border-2 border-yellow-500': jobsStore.filters.status === 'queued' }"
          @click="filterByStatus('queued')"
        >
          <div class="text-sm font-bold text-yellow-600 dark:text-yellow-400">
            {{ jobsStore.queueStatus?.queue?.queued || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Queue</div>
        </div>
        <div
          class="text-center p-1.5 bg-green-50 dark:bg-green-900/20 rounded-md cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          :class="{ 'border-2 border-green-500': jobsStore.filters.status === 'active' }"
          @click="filterByStatus('active')"
        >
          <div class="text-sm font-bold text-green-600 dark:text-green-400">
            {{ jobsStore.queueStatus?.queue?.active || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Active</div>
        </div>
        <div
          class="text-center p-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-md cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          :class="{ 'border-2 border-purple-500': jobsStore.filters.status === 'completed' }"
          @click="filterByStatus('completed')"
        >
          <div class="text-sm font-bold text-purple-600 dark:text-purple-400">
            {{ jobsStore.queueStatus?.queue?.completed || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Done</div>
        </div>
        <div
          class="text-center p-1.5 bg-red-50 dark:bg-red-900/20 rounded-md cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          :class="{ 'border-2 border-red-500': jobsStore.filters.status === 'failed' }"
          @click="filterByStatus('failed')"
        >
          <div class="text-sm font-bold text-red-600 dark:text-red-400">
            {{ jobsStore.queueStatus?.queue?.failed || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Failed</div>
        </div>
        <div
          class="text-center p-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-md cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          :class="{ 'border-2 border-orange-500': jobsStore.filters.status === 'need_input' }"
          @click="filterByStatus('need_input')"
        >
          <div class="text-sm font-bold text-orange-600 dark:text-orange-400">
            {{ jobsStore.queueStatus?.queue?.need_input || 0 }}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">Input</div>
        </div>
        <div
          class="text-center p-1.5 bg-gray-200 dark:bg-gray-700 rounded-md cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          :class="{ 'border-2 border-gray-500': jobsStore.filters.status === 'canceled' }"
          @click="filterByStatus('canceled')"
        >
          <div class="text-sm font-bold text-gray-700 dark:text-gray-300">
            {{ jobsStore.queueStatus?.queue?.canceled || 0 }}
          </div>
          <div class="text-xs text-gray-700 dark:text-gray-300">Cancel</div>
        </div>
      </div>

      <!-- Desktop: Original grid layout -->
      <div class="hidden sm:grid grid-cols-3 md:grid-cols-7 gap-4">
        <div
          class="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          :class="{ 'border-2 border-blue-500': jobsStore.filters.status === '' }"
          @click="filterByStatus('')"
        >
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ jobsStore.queueStatus?.queue?.total || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Jobs</div>
        </div>
        <div
          class="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
          :class="{ 'border-2 border-yellow-500': jobsStore.filters.status === 'queued' }"
          @click="filterByStatus('queued')"
        >
          <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {{ jobsStore.queueStatus?.queue?.queued || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Queued</div>
        </div>
        <div
          class="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          :class="{ 'border-2 border-green-500': jobsStore.filters.status === 'active' }"
          @click="filterByStatus('active')"
        >
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ jobsStore.queueStatus?.queue?.active || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Active</div>
        </div>
        <div
          class="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          :class="{ 'border-2 border-purple-500': jobsStore.filters.status === 'completed' }"
          @click="filterByStatus('completed')"
        >
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ jobsStore.queueStatus?.queue?.completed || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Completed</div>
        </div>
        <div
          class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          :class="{ 'border-2 border-red-500': jobsStore.filters.status === 'failed' }"
          @click="filterByStatus('failed')"
        >
          <div class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ jobsStore.queueStatus?.queue?.failed || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Failed</div>
        </div>
        <div
          class="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          :class="{ 'border-2 border-orange-500': jobsStore.filters.status === 'need_input' }"
          @click="filterByStatus('need_input')"
        >
          <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {{ jobsStore.queueStatus?.queue?.need_input || 0 }}
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Input</div>
        </div>
        <div
          class="text-center p-4 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          :class="{ 'border-2 border-gray-500': jobsStore.filters.status === 'canceled' }"
          @click="filterByStatus('canceled')"
        >
          <div class="text-2xl font-bold text-gray-700 dark:text-gray-300">
            {{ jobsStore.queueStatus?.queue?.canceled || 0 }}
          </div>
          <div class="text-sm text-gray-700 dark:text-gray-300">Canceled</div>
        </div>
      </div>

      <div v-if="jobsStore.queueStatus?.queue?.is_paused" class="mt-2 sm:mt-4 p-2 sm:p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div class="flex items-center">
          <UIcon name="i-heroicons-pause-circle" class="w-5 h-5 text-red-500 mr-2" />
          <span class="text-red-700 dark:text-red-300 font-medium">Queue is paused</span>
        </div>
      </div>
    </UCard>

    <!-- Subject Filter -->
    <UCard class="mb-3 sm:mb-6">

      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <div>
          <UInputMenu
            v-model="selectedSubjectFilter"
            v-model:search-term="subjectSearchQuery"
            :items="subjectFilterItems"
            placeholder="Search for a subject to filter jobs..."
            class="w-full"
            by="value"
            option-attribute="label"
            searchable
            @update:model-value="handleSubjectFilterSelection"
          />
        </div>
        
        <div>
          <USelect
            v-model="selectedSourceTypeFilter"
            :items="sourceTypeOptions"
            placeholder="Filter by job type..."
            class="w-full"
            @update:model-value="handleSourceTypeFilterSelection"
          />
        </div>
        
        <div class="flex items-end gap-2">
          <UButton
            type="button"
            variant="outline"
            size="xs"
            @click="clearSubjectFilter"
            :disabled="!selectedSubjectFilter"
          >
            <span class="inline">Clear Subject</span>
          </UButton>
          <UButton
            type="button"
            variant="outline"
            size="xs"
            @click="clearSourceTypeFilter"
            :disabled="selectedSourceTypeFilter === 'all'"
          >
            <span class="inline">Clear Type</span>
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Jobs List -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UCheckbox
              :model-value="allVisibleSelected"
              :indeterminate="hasPartialSelection"
              @update:model-value="toggleSelectAll"
            />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              Jobs
              <span v-if="hasSelectedJobs" class="text-sm font-normal text-gray-500 dark:text-gray-400">
                ({{ selectedJobs.size }} selected)
              </span>
            </h3>
          </div>
          
          <!-- Bulk Actions -->
          <div v-if="hasSelectedJobs" class="flex items-center gap-2">
            <UButton
              size="xs"
              color="primary"
              variant="outline"
              @click="bulkQueue"
            >
              Queue Selected
            </UButton>
            <UButton
              size="xs"
              color="red"
              variant="outline"
              @click="bulkCancel"
            >
              Cancel Selected
            </UButton>
            <UButton
              size="xs"
              color="red"
              variant="outline"
              @click="bulkDelete"
            >
              Delete Selected
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              @click="clearSelection"
            >
              Clear
            </UButton>
          </div>
        </div>
      </template>

      <div v-if="jobsStore.jobs.length === 0 && !jobsStore.isLoading" class="text-center py-8 text-gray-500 dark:text-gray-400">
        No jobs found
      </div>

      <div v-else-if="jobsStore.jobs.length === 0 && jobsStore.isLoading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
      </div>

      <div v-else class="h-80 sm:h-96 overflow-y-auto space-y-1 sm:space-y-2 pr-1 sm:pr-2">
        <div
          v-for="job in jobsStore.jobs"
          :key="job.id"
          class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 sm:p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative cursor-pointer"
          :class="{ 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600': selectedJobs.has(job.id) }"
          @click="viewJobDetails(job.id)"
        >
          <!-- Main job info row -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-1 sm:space-x-3 min-w-0 flex-1">
              <!-- Checkbox -->
              <UCheckbox
                :model-value="selectedJobs.has(job.id)"
                @update:model-value="(checked) => toggleJobSelection(job.id, checked)"
                @click.stop
              />
              <!-- Time since updated - moved to left side -->
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDateCompact(job.updated_at) }}
              </span>
              <UBadge
                :color="getStatusColor(job.status)"
                variant="solid"
                size="xs"
              >
                {{ getStatusDisplayText(job.status) }}
              </UBadge>
              <span class="text-xs text-gray-600 dark:text-gray-400 truncate">
                {{ job.subject?.name || 'Unknown Subject' }}
              </span>
              <!-- Desktop: Show full text -->
              <span class="text-xs text-gray-500 dark:text-gray-500 hidden sm:inline">
                {{ job.source_media_uuid ? 'vid' : 'source' }}
              </span>
              <!-- Mobile: Show single letter badges -->
              <UBadge
                v-if="job.source_media_uuid"
                color="blue"
                variant="soft"
                size="xs"
                class="sm:hidden"
              >
                V
              </UBadge>
              <UBadge
                v-else
                color="green"
                variant="soft"
                size="xs"
                class="sm:hidden"
              >
                S
              </UBadge>
              <!-- Desktop: Show progress bar when available -->
              <div v-if="job.progress && job.progress > 0 && job.progress < 100" class="hidden sm:flex items-center space-x-2">
                <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <div
                    class="bg-blue-600 h-1 rounded-full transition-all duration-300"
                    :style="{ width: `${job.progress}%` }"
                  />
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ job.progress }}%</span>
              </div>
            </div>
          </div>
          
          <!-- Full-height button container positioned absolutely -->
          <div class="absolute top-0 right-0 h-full flex items-center">
            <!-- Select button for need_input jobs -->
            <div
              v-if="job.status === 'need_input'"
              class="h-full flex items-center justify-center px-3 bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20 border-l border-gray-200 dark:border-gray-700 cursor-pointer"
              @click.stop="openImageSelectionModal(job)"
            >
              <span class="text-xs text-orange-600 dark:text-orange-400 font-medium">
                <span class="hidden sm:inline">Select</span>
                <span class="sm:hidden">Sel</span>
              </span>
            </div>
            
            <!-- Dropdown menu button -->
            <UDropdownMenu
              :items="getJobActions(job)"
              :ui="{ content: 'w-48' }"
            >
              <div
                class="h-full flex items-center justify-center px-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-l border-gray-200 dark:border-gray-700 rounded-r-lg cursor-pointer"
                :class="{ 'rounded-l-lg': job.status !== 'need_input' }"
                @click.stop
              >
                <UIcon name="i-heroicons-ellipsis-horizontal" class="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
            </UDropdownMenu>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-3 sm:mt-6 flex justify-center">
        <UPagination
          v-model:page="currentPage"
          :total="jobsStore.totalJobs"
          :items-per-page="itemsPerPage"
          :max="5"
          @update:page="handlePageChange"
        />
      </div>
    </UCard>

    <!-- Job Details Modal -->
    <JobDetailsModal
      v-model="showJobModal"
      :job="selectedJob"
      :job-output-images="jobOutputImages"
      @cancel-job="cancelJobFromModal"
      @retry-job="retryJobFromModal"
      @delete-job="deleteJobFromModal"
      @open-image-fullscreen="openImageFullscreen"
    />

    <!-- Source Image Selection Modal -->
    <SourceImageSelectionModal
      v-model="showImageModal"
      :job="selectedJobForImage"
      @image-selected="handleImageSelected"
    />
  </div>
</template>

<script setup>
import JobDetailsModal from '~/components/JobDetailsModal.vue'

// Page metadata
definePageMeta({
  title: 'Jobs'
})

// Use the jobs store
const jobsStore = useJobsStore()

// Local modal state
const showJobModal = ref(false)
const selectedJob = ref(null)
const outputVideoReady = ref(false)
const destVideoReady = ref(false)
const jobOutputImages = ref([])

// Image selection modal data (keeping for potential future use)
const showImageModal = ref(false)
const selectedJobForImage = ref(null)

// Pagination
const currentPage = ref(1)
const itemsPerPage = 20

// Local reactive filter state
const currentFilter = ref('')

// Bulk selection state
const selectedJobs = ref(new Set())

// Subject filtering using composable
const {
  selectedSubject: selectedSubjectFilter,
  searchQuery: subjectSearchQuery,
  subjectItems: subjectFilterItems,
  handleSubjectSelection,
  clearSubject
} = useSubjects()

// Source type filtering
const selectedSourceTypeFilter = ref('all')
const sourceTypeOptions = [
  { value: 'all', label: 'All Jobs' },
  { value: 'vid', label: 'Video Jobs' },
  { value: 'source', label: 'Source Jobs' }
]

// Subject filter handlers
const handleSubjectFilterSelection = async (selected) => {
  handleSubjectSelection(selected)
  if (selected && selected.value) {
    // Filter jobs by subject UUID
    currentFilter.value = `subject:${selected.value}`
    currentPage.value = 1
    const statusFilter = jobsStore.filters.status || ''
    const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
    await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, selected.value, sourceTypeFilter)
  } else {
    await clearSubjectFilter()
  }
}

const clearSubjectFilter = async () => {
  clearSubject()
  currentFilter.value = ''
  currentPage.value = 1
  const statusFilter = jobsStore.filters.status || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, '', sourceTypeFilter)
}

// Source type filter handlers
const handleSourceTypeFilterSelection = async (selected) => {
  selectedSourceTypeFilter.value = selected
  currentPage.value = 1
  const statusFilter = jobsStore.filters.status || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, subjectUuid, selected)
}

const clearSourceTypeFilter = async () => {
  selectedSourceTypeFilter.value = 'all'
  currentPage.value = 1
  const statusFilter = jobsStore.filters.status || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, subjectUuid, 'all')
}

// Computed properties
const totalPages = computed(() => Math.ceil(jobsStore.totalJobs / itemsPerPage))

// Bulk selection computed properties
const visibleJobIds = computed(() => jobsStore.jobs.map(job => job.id))
const selectedJobsArray = computed(() => Array.from(selectedJobs.value))
const hasSelectedJobs = computed(() => selectedJobs.value.size > 0)
const allVisibleSelected = computed(() => {
  return visibleJobIds.value.length > 0 && visibleJobIds.value.every(id => selectedJobs.value.has(id))
})
const hasPartialSelection = computed(() => {
  const selectedVisibleJobs = visibleJobIds.value.filter(id => selectedJobs.value.has(id))
  return selectedVisibleJobs.length > 0 && selectedVisibleJobs.length < visibleJobIds.value.length
})

// Bulk selection methods
const toggleSelectAll = () => {
  if (allVisibleSelected.value) {
    // If all are selected, unselect all visible jobs
    visibleJobIds.value.forEach(id => selectedJobs.value.delete(id))
  } else {
    // If none or some are selected, select all visible jobs
    visibleJobIds.value.forEach(id => selectedJobs.value.add(id))
  }
}

const toggleJobSelection = (jobId, checked) => {
  if (checked) {
    selectedJobs.value.add(jobId)
  } else {
    selectedJobs.value.delete(jobId)
  }
}

const clearSelection = () => {
  selectedJobs.value.clear()
}



// Methods
const filterByStatus = async (status) => {
  // Update local filter immediately
  currentFilter.value = status
  currentPage.value = 1
  
  // Also update store for UI consistency
  jobsStore.filters.status = status
  jobsStore.filters.jobId = ''
  jobsStore.filters.jobType = ''
  
  // Fetch jobs with new filter
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  await jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, status, subjectUuid, sourceTypeFilter)
}

const refreshJobsWithCurrentState = async () => {
  const statusFilter = jobsStore.filters.status || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  await Promise.all([
    jobsStore.fetchJobs(true, currentPage.value, itemsPerPage, statusFilter, subjectUuid, sourceTypeFilter),
    jobsStore.fetchQueueStatus()
  ])
}

// Handle pagination page changes
const handlePageChange = async (newPage) => {
  currentPage.value = newPage
  const statusFilter = jobsStore.filters.status || ''
  const subjectUuid = selectedSubjectFilter.value?.value || ''
  const sourceTypeFilter = selectedSourceTypeFilter.value || 'all'
  await jobsStore.fetchJobs(true, newPage, itemsPerPage, statusFilter, subjectUuid, sourceTypeFilter)
}

const viewJobDetails = async (jobId) => {
  try {
    // Reset video ready states when opening a new job
    outputVideoReady.value = false
    destVideoReady.value = false
    
    const response = await useApiFetch(`jobs/${jobId}?include_thumbnails=true&thumbnail_size=md`)
    selectedJob.value = response.job  // The media server returns {success: true, job: {...}}
    showJobModal.value = true
  } catch (error) {
    console.error('Failed to fetch job details:', error)
  }
}

const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'queued': return 'warning'
    case 'active': return 'info'
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'cancelled': return 'neutral'
    case 'need_input': return 'warning'
    default: return 'neutral'
  }
}

const formatDateCompact = (dateString) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(date)
}

// Helper method to format status display text
const getStatusDisplayText = (status) => {
  if (status === 'need_input') {
    return 'input'
  }
  return status
}

// Get job actions for dropdown menu
const getJobActions = (job) => {
  const actions = []
  
  // Add cancel option for queued/active/need_input jobs
  if (['queued', 'active', 'need_input'].includes(job.status)) {
    actions.push({
      label: 'Cancel Job',
      icon: 'i-heroicons-x-mark',
      onSelect: async () => {
        await cancelJob(job)
      }
    })
  }
  
  // Add retry option for failed, canceled, completed, or need_input jobs
  if (['canceled', 'failed', 'completed', 'need_input'].includes(job.status)) {
    actions.push({
      label: 'Retry Job',
      icon: 'i-heroicons-arrow-path',
      onSelect: async () => {
        await retryJob(job)
      }
    })
  }
  
  // Always add delete option
  actions.push({
    label: 'Delete Job',
    icon: 'i-heroicons-trash',
    onSelect: async () => {
      await deleteJob(job)
    }
  })
  
  return [actions]
}

// Image selection modal methods
const openImageSelectionModal = (job) => {
  selectedJobForImage.value = job
  showImageModal.value = true
}

// Image selection methods (keeping handleImageSelected for potential future use)
const handleImageSelected = async () => {
  await refreshJobsWithCurrentState()
}

const openImageFullscreen = (image) => {
  // TODO: Implement image fullscreen functionality
  console.log('Opening image fullscreen:', image)
}

// Job cancellation method
const cancelJob = async (job) => {
  try {
    const { confirm } = useConfirmDialog()
    
    const confirmed = await confirm({
      title: 'Cancel Job',
      message: `Are you sure you want to cancel job ${job.id}? This action cannot be undone.`,
      confirmLabel: 'Cancel Job',
      cancelLabel: 'Keep Job',
      variant: 'error'
    })
    
    if (!confirmed) return
    
    
    await useApiFetch(`jobs/${job.id}/cancel`, {
      method: 'POST'
    })
    
    
    // Refresh the jobs list after cancellation
    await refreshJobsWithCurrentState()
  } catch (error) {
    console.error('Failed to cancel job:', error)
    
    let errorMessage = 'Failed to cancel job'
    if (error.data?.statusMessage) {
      errorMessage = error.data.statusMessage
    } else if (error.message) {
      errorMessage = error.message
    }
    
    // Use confirm dialog for error messages too
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: errorMessage,
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

// Job retry method
const retryJob = async (job) => {
  try {
    const response = await useApiFetch(`jobs/${job.id}/retry`, {
      method: 'POST'
    })
    
    // Show success toast with new job ID
    const toast = useToast()
    toast.add({
      title: 'Job Retried Successfully',
      description: `New job ID: ${response.job_id}`,
      color: 'success',
      duration: 2000
    })
    
    // Refresh the jobs list after retry
    await refreshJobsWithCurrentState()
  } catch (error) {
    console.error('Failed to retry job:', error)
    
    let errorMessage = 'Failed to retry job'
    if (error.data?.statusMessage) {
      errorMessage = error.data.statusMessage
    } else if (error.message) {
      errorMessage = error.message
    }
    
    // Use confirm dialog for error messages
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: errorMessage,
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

// Job deletion method
const deleteJob = async (job) => {
  console.log('🗑️ deleteJob called with job:', job.id)
  try {
    const { confirm } = useConfirmDialog()
    
    console.log('🤔 Showing confirmation dialog...')
    const confirmed = await confirm({
      title: 'Delete Job',
      message: `Are you sure you want to delete job ${job.id}? This action cannot be undone and will remove the job and any associated output media.`,
      confirmLabel: 'Delete Job',
      cancelLabel: 'Cancel',
      variant: 'error'
    })
    
    console.log('✅ Confirmation result:', confirmed)
    if (!confirmed) {
      console.log('❌ User cancelled deletion')
      return
    }
    
    console.log('🚀 Making delete API call...')
    console.log('🔗 Delete URL:', `/api/jobs/${job.id}/delete`)
    const result = await useApiFetch(`jobs/${job.id}/delete`, {
      method: 'DELETE'
    })
    console.log('✅ Delete API call completed, result:', result)
    
    // Show success toast
    const toast = useToast()
    toast.add({
      title: 'Job Deleted Successfully',
      description: `Job ${job.id} has been deleted successfully.`,
      color: 'success',
      duration: 1000
    })
    
    // Refresh the jobs list after deletion with cache busting
    await refreshJobsWithCurrentState()
    // Also refresh queue status to update counts
    await jobsStore.fetchQueueStatus()
  } catch (error) {
    console.error('Failed to delete job:', error)
    
    let errorMessage = 'Failed to delete job'
    if (error.data?.statusMessage) {
      errorMessage = error.data.statusMessage
    } else if (error.message) {
      errorMessage = error.message
    }
    
    // Use confirm dialog for error messages
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: errorMessage,
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

// Modal-specific retry, cancel and delete handlers
const retryJobFromModal = async () => {
  console.log('🔄 retryJobFromModal called')
  if (selectedJob.value) {
    showJobModal.value = false
    await retryJob(selectedJob.value)
  }
}

const cancelJobFromModal = async () => {
  if (selectedJob.value) {
    showJobModal.value = false
    await cancelJob(selectedJob.value)
  }
}

const deleteJobFromModal = async () => {
  console.log('🗑️ deleteJobFromModal called')
  if (selectedJob.value) {
    console.log('🗑️ selectedJob exists, closing modal and calling deleteJob')
    showJobModal.value = false
    await deleteJob(selectedJob.value)
  } else {
    console.log('❌ No selectedJob found!')
  }
}

// Bulk operation methods
const bulkQueue = async () => {
  const jobsToQueue = selectedJobsArray.value.filter(jobId => {
    const job = jobsStore.jobs.find(j => j.id === jobId)
    return job && ['canceled', 'failed', 'completed', 'need_input'].includes(job.status)
  })
  
  if (jobsToQueue.length === 0) {
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'No Jobs to Queue',
      message: 'Selected jobs cannot be queued. Only canceled, failed, completed, or need_input jobs can be queued.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'warning'
    })
    return
  }
  
  const { confirm } = useConfirmDialog()
  const confirmed = await confirm({
    title: 'Queue Selected Jobs',
    message: `Are you sure you want to queue ${jobsToQueue.length} job(s)?`,
    confirmLabel: 'Queue Jobs',
    cancelLabel: 'Cancel',
    variant: 'primary'
  })
  
  if (!confirmed) return
  
  try {
    // Queue jobs by retrying them
    for (const jobId of jobsToQueue) {
      await useApiFetch(`jobs/${jobId}/retry`, { method: 'POST' })
    }
    
    const toast = useToast()
    toast.add({
      title: 'Jobs Queued Successfully',
      description: `${jobsToQueue.length} job(s) have been queued.`,
      color: 'success',
      duration: 2000
    })
    
    clearSelection()
    await refreshJobsWithCurrentState()
  } catch (error) {
    console.error('Failed to queue jobs:', error)
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: 'Failed to queue some jobs. Please try again.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

const bulkCancel = async () => {
  const jobsToCancel = selectedJobsArray.value.filter(jobId => {
    const job = jobsStore.jobs.find(j => j.id === jobId)
    return job && ['queued', 'active', 'need_input'].includes(job.status)
  })
  
  if (jobsToCancel.length === 0) {
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'No Jobs to Cancel',
      message: 'Selected jobs cannot be canceled. Only queued, active, or need_input jobs can be canceled.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'warning'
    })
    return
  }
  
  const { confirm } = useConfirmDialog()
  const confirmed = await confirm({
    title: 'Cancel Selected Jobs',
    message: `Are you sure you want to cancel ${jobsToCancel.length} job(s)? This action cannot be undone.`,
    confirmLabel: 'Cancel Jobs',
    cancelLabel: 'Keep Jobs',
    variant: 'error'
  })
  
  if (!confirmed) return
  
  try {
    for (const jobId of jobsToCancel) {
      await useApiFetch(`jobs/${jobId}/cancel`, { method: 'POST' })
    }
    
    const toast = useToast()
    toast.add({
      title: 'Jobs Canceled Successfully',
      description: `${jobsToCancel.length} job(s) have been canceled.`,
      color: 'success',
      duration: 2000
    })
    
    clearSelection()
    await refreshJobsWithCurrentState()
  } catch (error) {
    console.error('Failed to cancel jobs:', error)
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: 'Failed to cancel some jobs. Please try again.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

const bulkDelete = async () => {
  const { confirm } = useConfirmDialog()
  const confirmed = await confirm({
    title: 'Delete Selected Jobs',
    message: `Are you sure you want to delete ${selectedJobs.value.size} job(s)? This action cannot be undone and will remove the jobs and any associated output media.`,
    confirmLabel: 'Delete Jobs',
    cancelLabel: 'Cancel',
    variant: 'error'
  })
  
  if (!confirmed) return
  
  try {
    for (const jobId of selectedJobsArray.value) {
      await useApiFetch(`jobs/${jobId}/delete`, { method: 'DELETE' })
    }
    
    const toast = useToast()
    toast.add({
      title: 'Jobs Deleted Successfully',
      description: `${selectedJobs.value.size} job(s) have been deleted.`,
      color: 'success',
      duration: 2000
    })
    
    clearSelection()
    await refreshJobsWithCurrentState()
    await jobsStore.fetchQueueStatus()
  } catch (error) {
    console.error('Failed to delete jobs:', error)
    const { confirm } = useConfirmDialog()
    await confirm({
      title: 'Error',
      message: 'Failed to delete some jobs. Please try again.',
      confirmLabel: 'OK',
      cancelLabel: '',
      variant: 'error'
    })
  }
}

// Handle page visibility changes
const handleVisibilityChange = () => {
  if (document.hidden) {
    jobsStore.stopAutoRefresh()
  } else if (jobsStore.autoRefreshEnabled) {
    jobsStore.startAutoRefresh()
  }
}


// Reset video states when modal is closed
watch(showJobModal, (isOpen) => {
  if (!isOpen) {
    outputVideoReady.value = false
    destVideoReady.value = false
  }
})

// Clear selection when page changes or filters change
watch([currentPage, () => jobsStore.filters.status, selectedSubjectFilter, selectedSourceTypeFilter], () => {
  clearSelection()
})


// Lifecycle
onMounted(() => {
  jobsStore.fetchInitialData()
  
  // Listen for page visibility changes
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  jobsStore.stopAutoRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// Page head
useHead({
  title: 'Jobs - Media Server Job System',
  meta: [
    { name: 'description', content: 'Monitor and manage video processing jobs' }
  ]
})
</script>

