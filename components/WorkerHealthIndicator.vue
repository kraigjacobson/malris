<template>
  <div class="flex items-center gap-2">
    <!-- LED Indicator -->
    <div class="relative">
      <div 
        :class="[
          'w-3 h-3 rounded-full transition-all duration-300',
          healthStatus.healthy 
            ? 'bg-green-500 shadow-green-500/50 shadow-lg animate-pulse' 
            : 'bg-red-500 shadow-red-500/50 shadow-lg'
        ]"
      />
      <!-- Glow effect for healthy status -->
      <div 
        v-if="healthStatus.healthy"
        :class="[
          'absolute inset-0 w-3 h-3 rounded-full bg-green-400 opacity-75 animate-ping'
        ]"
      />
    </div>
    
    <!-- Status Text -->
    <span 
      :class="[
        'text-sm font-medium transition-colors duration-300',
        healthStatus.healthy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      ]"
    >
      {{ statusText }}
    </span>
    
    <!-- Tooltip with details -->
    <UTooltip 
      :text="tooltipText"
      :popper="{ placement: 'bottom' }"
    >
      <UIcon 
        name="i-heroicons-information-circle" 
        class="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help"
      />
    </UTooltip>
  </div>
</template>

<script setup lang="ts">
interface WorkerHealth {
  healthy: boolean
  available: boolean
  status: string
  queue_remaining?: number
  running_jobs_count?: number
  message?: string
  timestamp: string
}

// Reactive health status
const healthStatus = ref<WorkerHealth>({
  healthy: false,
  available: false,
  status: 'checking',
  message: 'Checking worker status...',
  timestamp: new Date().toISOString()
})

// Computed status text
const statusText = computed(() => {
  if (!healthStatus.value.healthy) {
    return 'Worker Offline'
  }
  if (!healthStatus.value.available) {
    return 'Worker Busy'
  }
  return 'Worker Ready'
})

// Computed tooltip text
const tooltipText = computed(() => {
  const status = healthStatus.value
  let text = `Status: ${status.status}\n`
  
  if (status.healthy) {
    text += `Queue: ${status.queue_remaining || 0} remaining\n`
    text += `Running: ${status.running_jobs_count || 0} jobs\n`
  }
  
  if (status.message) {
    text += `Message: ${status.message}\n`
  }
  
  text += `Last check: ${new Date(status.timestamp).toLocaleTimeString()}`
  
  return text
})

// Function to check worker health
const checkWorkerHealth = async () => {
  try {
    const data = await $fetch<WorkerHealth>('/api/worker/health')
    healthStatus.value = data || healthStatus.value
  } catch (error) {
    console.error('Failed to check worker health:', error)
    healthStatus.value = {
      healthy: false,
      available: false,
      status: 'error',
      message: 'Failed to connect to worker',
      timestamp: new Date().toISOString()
    }
  }
}

// Check health on mount and set up interval
onMounted(() => {
  checkWorkerHealth()
  
  // Check every 5 seconds
  const interval = setInterval(checkWorkerHealth, 5000)
  
  // Cleanup on unmount
  onUnmounted(() => {
    clearInterval(interval)
  })
})
</script>