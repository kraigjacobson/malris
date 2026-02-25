<template>
  <div class="flex items-center gap-2">
    <!-- LED Indicator -->
    <div class="relative">
      <div
        :class="[
          'w-3 h-3 rounded-full transition-all duration-300',
          isHealthy
            ? 'bg-green-500 shadow-green-500/50 shadow-lg animate-pulse'
            : 'bg-red-500 shadow-red-500/50 shadow-lg'
        ]"
      />
      <!-- Glow effect for healthy status -->
      <div
        v-if="isHealthy"
        :class="[
          'absolute inset-0 w-3 h-3 rounded-full bg-green-400 opacity-75 animate-ping'
        ]"
      />
    </div>

    <!-- Status Text -->
    <span
      :class="[
        'text-sm font-medium transition-colors duration-300',
        isHealthy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      ]"
    >
      {{ statusText }}
    </span>
  </div>
</template>

<script setup lang="ts">
// Use jobs store for real-time WebSocket updates instead of polling
const jobsStore = useJobsStore()

// Computed health status from WebSocket state
const isHealthy = computed(() => {
  const systemStatus = jobsStore.systemStatus
  if (!systemStatus) return false

  // Worker is healthy if both RunPod worker and ComfyUI are healthy
  return systemStatus.runpodWorker?.status === 'healthy' &&
         systemStatus.comfyui?.status === 'healthy'
})

// Computed availability status
const isAvailable = computed(() => {
  const systemStatus = jobsStore.systemStatus
  if (!systemStatus) return false

  // Worker is available if ComfyUI processing status is idle
  return systemStatus.comfyuiProcessing?.status === 'idle'
})

// Computed status text
const statusText = computed(() => {
  if (!isHealthy.value) {
    return 'Worker Offline'
  }
  if (!isAvailable.value) {
    return 'Worker Busy'
  }
  return 'Worker Ready'
})

// No more polling - all updates come via WebSocket in real-time!
</script>
