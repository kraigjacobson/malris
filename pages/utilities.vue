<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">System Utilities</h1>

      <div class="space-y-6">
        <!-- Tag All Untagged Videos Card - Full Width -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-tag" class="w-8 h-8 text-blue-500 mr-3" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">AI Video Tagging</h2>
          </div>

          <!-- Queue Status Display -->
          <div v-if="queueStatus" class="mb-6 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-6 flex items-center">
              <UIcon name="i-heroicons-queue-list" class="w-5 h-5 mr-3 text-indigo-500" />
              Tagging Queue Status
            </h3>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                  {{ queueStatus.totalUntagged }}
                </div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">Total<br />Untagged</div>
              </div>

              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold text-amber-600 dark:text-amber-400 mb-2">
                  {{ queueStatus.queueLength }}
                </div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">In<br />Queue</div>
              </div>

              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold mb-2" :class="queueStatus.isProcessing ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'">
                  {{ queueStatus.isProcessing ? 'YES' : 'NO' }}
                </div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">Processing</div>
              </div>

              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold text-violet-600 dark:text-violet-400 mb-2">{{ queueStatus.currentBatch.processed }}/{{ queueStatus.currentBatch.total }}</div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">Current<br />Batch</div>
              </div>
            </div>

            <!-- Progress Bar for Current Batch -->
            <div v-if="queueStatus.currentBatch.total > 0" class="mt-6 bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div class="flex justify-between items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                <span class="flex items-center">
                  <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 mr-2 text-indigo-500" />
                  Batch Progress
                </span>
                <span class="text-lg font-bold text-indigo-600 dark:text-indigo-400"> {{ Math.round((queueStatus.currentBatch.processed / queueStatus.currentBatch.total) * 100) }}% </span>
              </div>
              <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out" :style="{ width: `${(queueStatus.currentBatch.processed / queueStatus.currentBatch.total) * 100}%` }"></div>
              </div>
              <div v-if="queueStatus.currentBatch.errors > 0" class="flex items-center mt-3 text-rose-600 dark:text-rose-400 text-sm font-medium">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 mr-2" />
                {{ queueStatus.currentBatch.errors }} error{{ queueStatus.currentBatch.errors !== 1 ? 's' : '' }}
              </div>
            </div>
          </div>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"> Batch Size (1-1000) </label>
            <UInput v-model.number="batchSize" type="number" :min="1" :max="1000" placeholder="50" class="w-full" />
          </div>

          <div class="flex justify-end">
            <UButton :loading="isTagging" :disabled="isTagging" color="primary" size="lg" @click="tagAllUntaggedVideos">
              <UIcon name="i-heroicons-tag" class="mr-2" />
              {{ isTagging ? 'Processing Batch...' : `Tag Next ${batchSize} Videos` }}
            </UButton>
          </div>

          <div v-if="lastTaggingResult" class="mt-4 p-3 rounded-md" :class="lastTaggingResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
            <p class="text-sm">{{ lastTaggingResult.message }}</p>
            <div v-if="lastTaggingResult.success && lastTaggingResult.totalRemaining !== undefined" class="mt-2 text-xs opacity-75">
              <div>Videos remaining: {{ lastTaggingResult.totalRemaining }}</div>
            </div>
          </div>
        </div>

        <!-- Thumbnail Regeneration Card -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-photo" class="w-8 h-8 text-purple-500 mr-3" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Thumbnail Regeneration</h2>
          </div>

          <p class="text-gray-600 dark:text-gray-400 mb-6">Regenerate thumbnails for destination videos and populate missing metadata using ffprobe analysis.</p>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"> Batch Size (1-100) </label>
            <UInput v-model.number="thumbnailBatchSize" type="number" :min="1" :max="100" placeholder="50" class="w-full" />
          </div>

          <div class="flex justify-end">
            <UButton :loading="isRegeneratingThumbnails" :disabled="isRegeneratingThumbnails" color="primary" size="lg" @click="regenerateThumbnails">
              <UIcon name="i-heroicons-photo" class="mr-2" />
              {{ isRegeneratingThumbnails ? 'Processing...' : `Regenerate Next ${thumbnailBatchSize} Thumbnails` }}
            </UButton>
          </div>

          <div v-if="lastThumbnailResult" class="mt-4 p-3 rounded-md" :class="lastThumbnailResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
            <p class="text-sm">{{ lastThumbnailResult.message }}</p>
            <div v-if="lastThumbnailResult.success && lastThumbnailResult.remainingWithoutMetadata !== undefined" class="mt-2 text-xs opacity-75">
              <div>Videos without metadata remaining: {{ lastThumbnailResult.remainingWithoutMetadata }}</div>
            </div>
          </div>
        </div>

        <!-- Orphaned Images Cleanup Card -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-trash" class="w-8 h-8 text-red-500 mr-3" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Orphaned Images Cleanup</h2>
          </div>
          <p class="text-gray-600 dark:text-gray-400 mb-6">Delete orphaned output images from completed/failed jobs that are not being used as thumbnails.</p>

          <!-- Orphan Count Display -->
          <div v-if="orphanCount !== null" class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                <UIcon name="i-heroicons-photo" class="w-5 h-5 text-blue-500 mr-2" />
                <span class="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {{ cleanupStatus?.running ? 'Orphaned Images Remaining:' : 'Orphaned Images Found:' }}
                </span>
              </div>
              <span class="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {{ orphanCount.toLocaleString() }}
              </span>
            </div>
          </div>
          <div class="flex justify-end gap-3">
            <UButton v-if="cleanupStatus?.running" :loading="isCanceling" :disabled="isCanceling" color="error" size="lg" @click="cancelCleanup">
              <UIcon name="i-heroicons-x-circle" class="mr-2" />
              {{ isCanceling ? 'Canceling...' : 'Cancel Cleanup' }}
            </UButton>
            <UButton v-else :loading="isStartingCleanup" :disabled="isStartingCleanup || cleanupStatus?.running" color="error" size="lg" @click="startCleanup">
              <UIcon name="i-heroicons-trash" class="mr-2" />
              {{ isStartingCleanup ? 'Starting...' : 'Start Cleanup' }}
            </UButton>
          </div>

          <div v-if="lastCleanupResult" class="mt-4 p-3 rounded-md" :class="lastCleanupResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
            <p class="text-sm">{{ lastCleanupResult.message }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Page metadata
definePageMeta({
  title: 'System Utilities'
})

// Reactive state
const isTagging = ref(false)
const batchSize = ref(50) // Default to 50
const lastTaggingResult = ref<{ success: boolean; message: string; totalRemaining?: number } | null>(null)
const queueStatus = ref<{
  totalUntagged: number
  queueLength: number
  isProcessing: boolean
  currentBatch: { processed: number; total: number; errors: number }
} | null>(null)

// Thumbnail regeneration state
const isRegeneratingThumbnails = ref(false)
const thumbnailBatchSize = ref(50) // Default to 50
const lastThumbnailResult = ref<{ success: boolean; message: string; remainingWithoutMetadata?: number } | null>(null)

// Orphaned images cleanup state
const isStartingCleanup = ref(false)
const isCanceling = ref(false)
const lastCleanupResult = ref<{ success: boolean; message: string } | null>(null)
const orphanCount = ref<number | null>(null)
const cleanupStatus = ref<{
  running: boolean
  progress: number
  total: number
  deleted: number
  startTime: string | null
  lastUpdate: string | null
  error: string | null
} | null>(null)

// Auto-refresh management
let refreshInterval: NodeJS.Timeout | null = null
let cleanupRefreshInterval: NodeJS.Timeout | null = null

// Auto-refresh queue status every 2 seconds
const { data: queueData, refresh: refreshQueue } = await useFetch('/api/media/tagging-queue-status', {
  server: false,
  default: () => null,
  transform: (data: any) => data
})

// Watch for queue data changes
watch(
  queueData,
  newData => {
    if (newData?.success) {
      queueStatus.value = {
        totalUntagged: newData.totalUntagged,
        queueLength: newData.queueLength,
        isProcessing: newData.isProcessing,
        currentBatch: newData.currentBatch
      }

      // Manage refresh interval based on queue activity
      const hasActivity = newData.queueLength > 0 || newData.isProcessing || newData.currentBatch.total > 0

      if (hasActivity && !refreshInterval) {
        // Start refreshing when there's activity
        console.log('🔄 Starting queue status refresh')
        refreshInterval = setInterval(() => {
          refreshQueue()
        }, 2000)
      } else if (!hasActivity && refreshInterval) {
        // Stop refreshing when queue is empty and nothing is processing
        console.log('⏸️ Stopping queue status refresh - no activity')
        clearInterval(refreshInterval)
        refreshInterval = null
      }
    }
  },
  { immediate: true }
)

onMounted(() => {
  // Initial refresh to check if we need to start the interval
  refreshQueue()
  // Initial cleanup status and orphan count fetch
  fetchCleanupStatus()
  fetchOrphanCount()
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
  if (cleanupRefreshInterval) {
    clearInterval(cleanupRefreshInterval)
    cleanupRefreshInterval = null
  }
})

// Fetch cleanup status
const fetchCleanupStatus = async () => {
  try {
    const response = await $fetch<{
      running: boolean
      progress: number | null
      total: number | null
      deleted: number | null
      startTime: string | null
      lastUpdate: string | null
      error: string | null
    }>('/api/cleanup/orphaned-images/status')

    cleanupStatus.value = {
      running: response.running,
      progress: response.progress || 0,
      total: response.total || 0,
      deleted: response.deleted || 0,
      startTime: response.startTime,
      lastUpdate: response.lastUpdate,
      error: response.error
    }

    // Manage cleanup refresh interval
    if (response.running && !cleanupRefreshInterval) {
      console.log('🔄 Starting cleanup status refresh')
      cleanupRefreshInterval = setInterval(() => {
        fetchCleanupStatus()
      }, 1000) // Refresh every second during cleanup
    } else if (!response.running && cleanupRefreshInterval) {
      console.log('⏸️ Stopping cleanup status refresh')
      clearInterval(cleanupRefreshInterval)
      cleanupRefreshInterval = null
      // Refresh orphan count when cleanup completes
      fetchOrphanCount()
    }
  } catch (error) {
    console.error('Error fetching cleanup status:', error)
  }
}

// Fetch orphan count
const fetchOrphanCount = async () => {
  try {
    const response = await $fetch<{
      success: boolean
      count: number
      isRunning: boolean
    }>('/api/cleanup/orphaned-images/count')

    if (response.success) {
      orphanCount.value = response.count

      // If cleanup is running, start fetching status
      if (response.isRunning) {
        fetchCleanupStatus()
      }
    }
  } catch (error) {
    console.error('Error fetching orphan count:', error)
  }
}

// Function to tag next batch of untagged videos
const tagAllUntaggedVideos = async () => {
  try {
    isTagging.value = true
    lastTaggingResult.value = null

    const toast = useToast()

    // Show loading toast
    toast.add({
      title: 'Starting AI Tagging',
      description: `Processing next batch of ${batchSize.value} untagged videos...`,
      icon: 'i-heroicons-tag'
    })

    // Call the API to process next batch with custom size
    const response = await $fetch<{
      success: boolean
      count: number
      totalRemaining: number
      hasMore: boolean
      message: string
    }>('/api/media/tag-all-untagged', {
      method: 'POST',
      body: {
        batchSize: batchSize.value
      }
    })

    if (!response.success) {
      throw new Error(response.message)
    }

    // Store result for display
    lastTaggingResult.value = {
      success: response.success,
      message: response.message,
      totalRemaining: response.totalRemaining
    }

    // Show success toast
    toast.add({
      title: 'Batch Started',
      description: `Processing ${response.count} videos. ${response.totalRemaining} videos remaining after this batch.`,
      icon: 'i-heroicons-check-circle',
      color: 'success'
    })

    // Refresh queue status immediately after starting batch
    refreshQueue()
  } catch (error: any) {
    const toast = useToast()

    // Store error result
    lastTaggingResult.value = {
      success: false,
      message: error?.message || 'Failed to start tagging process'
    }

    toast.add({
      title: 'Tagging Failed',
      description: error?.message || 'Failed to start tagging process',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'error'
    })
    console.error('Error tagging videos:', error)
  } finally {
    isTagging.value = false
  }
}

// Function to regenerate thumbnails
const regenerateThumbnails = async () => {
  try {
    isRegeneratingThumbnails.value = true
    lastThumbnailResult.value = null

    const toast = useToast()

    // Show loading toast
    toast.add({
      title: 'Starting Thumbnail Regeneration',
      description: `Processing next batch of ${thumbnailBatchSize.value} videos...`,
      icon: 'i-heroicons-photo'
    })

    // Call the API to regenerate thumbnails
    const response = await $fetch<{
      success: boolean
      processed: number
      remainingWithoutMetadata: number
      message: string
    }>('/api/media/regenerate-thumbnails', {
      method: 'POST',
      body: {
        batchSize: thumbnailBatchSize.value
      }
    })

    if (!response.success) {
      throw new Error(response.message)
    }

    // Store result for display
    lastThumbnailResult.value = {
      success: response.success,
      message: response.message,
      remainingWithoutMetadata: response.remainingWithoutMetadata
    }

    // Show success toast
    toast.add({
      title: 'Thumbnails Regenerated',
      description: `Processed ${response.processed} videos. ${response.remainingWithoutMetadata} videos without metadata remaining.`,
      icon: 'i-heroicons-check-circle',
      color: 'success'
    })
  } catch (error: any) {
    const toast = useToast()

    // Store error result
    lastThumbnailResult.value = {
      success: false,
      message: error?.message || 'Failed to regenerate thumbnails'
    }

    toast.add({
      title: 'Thumbnail Regeneration Failed',
      description: error?.message || 'Failed to regenerate thumbnails',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'error'
    })
    console.error('Error regenerating thumbnails:', error)
  } finally {
    isRegeneratingThumbnails.value = false
  }
}

// Function to start cleanup
const startCleanup = async () => {
  try {
    isStartingCleanup.value = true
    lastCleanupResult.value = null

    const toast = useToast()

    toast.add({
      title: 'Starting Cleanup',
      description: 'Deleting orphaned output images...',
      icon: 'i-heroicons-trash'
    })

    const response = await $fetch<{
      success: boolean
      message: string
    }>('/api/cleanup/orphaned-images/start', {
      method: 'POST'
    })

    if (!response.success) {
      throw new Error(response.message)
    }

    lastCleanupResult.value = {
      success: response.success,
      message: response.message
    }

    toast.add({
      title: 'Cleanup Started',
      description: response.message,
      icon: 'i-heroicons-check-circle',
      color: 'success'
    })

    fetchCleanupStatus()
    // Refresh orphan count after starting
    setTimeout(() => fetchOrphanCount(), 2000)
  } catch (error: any) {
    const toast = useToast()

    lastCleanupResult.value = {
      success: false,
      message: error?.message || 'Failed to start cleanup'
    }

    toast.add({
      title: 'Cleanup Failed',
      description: error?.message || 'Failed to start cleanup',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'error'
    })
    console.error('Error starting cleanup:', error)
  } finally {
    isStartingCleanup.value = false
  }
}

// Function to cancel cleanup
const cancelCleanup = async () => {
  try {
    isCanceling.value = true

    const toast = useToast()

    toast.add({
      title: 'Canceling Cleanup',
      description: 'Requesting cleanup cancellation...',
      icon: 'i-heroicons-x-circle'
    })

    const response = await $fetch<{
      success: boolean
      message: string
    }>('/api/cleanup/orphaned-images/cancel', {
      method: 'POST'
    })

    if (!response.success) {
      throw new Error(response.message)
    }

    toast.add({
      title: 'Cancellation Requested',
      description: response.message,
      icon: 'i-heroicons-check-circle',
      color: 'success'
    })

    fetchCleanupStatus()
  } catch (error: any) {
    const toast = useToast()

    toast.add({
      title: 'Cancellation Failed',
      description: error?.message || 'Failed to cancel cleanup',
      icon: 'i-heroicons-exclamation-triangle',
      color: 'error'
    })
    console.error('Error canceling cleanup:', error)
  } finally {
    isCanceling.value = false
  }
}
</script>
