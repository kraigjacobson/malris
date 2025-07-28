<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">
        System Utilities
      </h1>
      
      <div class="space-y-6">
        <!-- Tag All Untagged Videos Card - Full Width -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-tag" class="w-8 h-8 text-blue-500 mr-3" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
              AI Video Tagging
            </h2>
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
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">
                  Total<br>Untagged
                </div>
              </div>
              
              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold text-amber-600 dark:text-amber-400 mb-2">
                  {{ queueStatus.queueLength }}
                </div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">
                  In<br>Queue
                </div>
              </div>
              
              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold mb-2" :class="queueStatus.isProcessing ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'">
                  {{ queueStatus.isProcessing ? 'YES' : 'NO' }}
                </div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">
                  Processing
                </div>
              </div>
              
              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-slate-200 dark:border-slate-700">
                <div class="text-3xl font-bold text-violet-600 dark:text-violet-400 mb-2">
                  {{ queueStatus.currentBatch.processed }}/{{ queueStatus.currentBatch.total }}
                </div>
                <div class="text-sm font-medium text-slate-600 dark:text-slate-400 leading-tight">
                  Current<br>Batch
                </div>
              </div>
            </div>
            
            <!-- Progress Bar for Current Batch -->
            <div v-if="queueStatus.currentBatch.total > 0" class="mt-6 bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div class="flex justify-between items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                <span class="flex items-center">
                  <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 mr-2 text-indigo-500" />
                  Batch Progress
                </span>
                <span class="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                  {{ Math.round((queueStatus.currentBatch.processed / queueStatus.currentBatch.total) * 100) }}%
                </span>
              </div>
              <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                <div
                  class="bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out"
                  :style="{ width: `${(queueStatus.currentBatch.processed / queueStatus.currentBatch.total) * 100}%` }"
                ></div>
              </div>
              <div v-if="queueStatus.currentBatch.errors > 0" class="flex items-center mt-3 text-rose-600 dark:text-rose-400 text-sm font-medium">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 mr-2" />
                {{ queueStatus.currentBatch.errors }} error{{ queueStatus.currentBatch.errors !== 1 ? 's' : '' }}
              </div>
            </div>
          </div>
          
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Batch Size (1-1000)
            </label>
            <UInput
              v-model.number="batchSize"
              type="number"
              :min="1"
              :max="1000"
              placeholder="50"
              class="w-full"
            />
          </div>
          
          <div class="flex justify-end">
            <UButton
              :loading="isTagging"
              :disabled="isTagging"
              color="primary"
              size="lg"
              @click="tagAllUntaggedVideos"
            >
              <UIcon name="i-heroicons-tag" class="mr-2" />
              {{ isTagging ? 'Processing Batch...' : `Tag Next ${batchSize} Videos` }}
            </UButton>
          </div>
          
          <div v-if="lastTaggingResult" class="mt-4 p-3 rounded-md" :class="lastTaggingResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'">
            <p class="text-sm">{{ lastTaggingResult.message }}</p>
            <div v-if="lastTaggingResult.success && lastTaggingResult.totalRemaining !== undefined" class="mt-2 text-xs opacity-75">
              <div>
                Videos remaining: {{ lastTaggingResult.totalRemaining }}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Placeholder for future utilities -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700 opacity-50">
          <div class="flex items-center mb-4">
            <UIcon name="i-heroicons-wrench-screwdriver" class="w-8 h-8 text-gray-400 mr-3" />
            <h2 class="text-xl font-semibold text-gray-500">
              More Utilities
            </h2>
          </div>
          
          <p class="text-gray-400 mb-6">
            Additional system utilities will be added here as needed.
          </p>
          
          <UButton
            disabled
            color="neutral"
            size="lg"
            block
          >
            Coming Soon
          </UButton>
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

// Auto-refresh management
let refreshInterval: NodeJS.Timeout | null = null

// Auto-refresh queue status every 2 seconds
const { data: queueData, refresh: refreshQueue } = await useFetch('/api/media/tagging-queue-status', {
  server: false,
  default: () => null,
  transform: (data: any) => data
})

// Watch for queue data changes
watch(queueData, (newData) => {
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
}, { immediate: true })

onMounted(() => {
  // Initial refresh to check if we need to start the interval
  refreshQueue()
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
})

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
      success: boolean;
      count: number;
      totalRemaining: number;
      hasMore: boolean;
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
</script>