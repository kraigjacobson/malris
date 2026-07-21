<template>
  <div class="flex items-center gap-3">
    <!-- Faceswap Worker -->
    <div class="flex items-center gap-1.5" :title="`Faceswap: ${faceswapStatus}`">
      <div :class="['w-2.5 h-2.5 rounded-full', faceswapHealthy ? 'bg-green-500 animate-pulse' : 'bg-red-500']" />
      <span :class="['text-xs', faceswapHealthy ? 'text-green-400' : 'text-red-400']">FS</span>
    </div>

    <!-- Wan Worker (handles both i2v and t2v) -->
    <div class="flex items-center gap-1.5" :title="`Wan (i2v + t2v): ${wanStatus}`">
      <div :class="['w-2.5 h-2.5 rounded-full', wanHealthy ? 'bg-green-500 animate-pulse' : 'bg-red-500']" />
      <span :class="['text-xs', wanHealthy ? 'text-green-400' : 'text-red-400']">Wan</span>
    </div>

    <!-- Overall Status Text -->
    <span :class="['text-sm font-medium', anyHealthy ? 'text-green-400' : 'text-red-400']">
      {{ statusText }}
    </span>
  </div>
</template>

<script setup lang="ts">
const jobsStore = useJobsStore()

const faceswapHealthy = computed(() => {
  const s = jobsStore.systemStatus
  return s?.runpodWorker?.status === 'healthy' && s?.comfyui?.status === 'healthy'
})

const wanHealthy = computed(() => {
  return jobsStore.systemStatus?.wanWorker?.status === 'healthy'
})

const anyHealthy = computed(() => faceswapHealthy.value || wanHealthy.value)

const faceswapStatus = computed(() => faceswapHealthy.value ? 'Healthy' : 'Offline')
const wanStatus = computed(() => wanHealthy.value ? 'Healthy' : 'Offline')

const statusText = computed(() => {
  if (!anyHealthy.value) return 'All Offline'
  if (faceswapHealthy.value && wanHealthy.value) return 'All Ready'
  if (faceswapHealthy.value) return 'FS Ready'
  return 'Wan Ready'
})
</script>
