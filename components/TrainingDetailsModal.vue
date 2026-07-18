<template>
  <UModal v-model:open="isOpen" :fullscreen="isMobile" :ui="{ content: 'max-w-2xl' }">
    <template #header>
      <div class="flex items-center gap-2 min-w-0">
        <h3 class="text-lg font-semibold truncate">{{ training?.loraName || 'Training' }}</h3>
        <UBadge v-if="training" :color="statusColor(training.status)" variant="solid" size="xs">
          {{ training.status }}
        </UBadge>
      </div>
    </template>

    <template #body>
      <div v-if="!training" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl text-gray-400" />
      </div>

      <UAccordion
        v-else
        type="multiple"
        :items="accordionItems"
      >
        <template #progress>
          <div class="space-y-3 pb-2">
            <div class="flex items-center gap-3">
              <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div class="bg-blue-600 h-2 rounded-full transition-all" :style="{ width: `${training.progress || 0}%` }" />
              </div>
              <span class="text-sm text-gray-600 dark:text-gray-300">{{ training.progress || 0 }}%</span>
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400 space-y-1">
              <p>Subject: {{ training.subjectName || training.subjectUuid }}</p>
              <p>Created: {{ formatDate(training.createdAt) }}</p>
              <p v-if="training.startedAt">Started: {{ formatDate(training.startedAt) }}</p>
              <p v-if="training.completedAt">Completed: {{ formatDate(training.completedAt) }}</p>
              <p v-if="training.errorMessage" class="text-red-500">{{ training.errorMessage }}</p>
              <p class="text-xs">
                Two experts train sequentially (low then high noise) — the bar covers both halves.
              </p>
            </div>
          </div>
        </template>

        <template #config>
          <div class="text-sm text-gray-600 dark:text-gray-300 space-y-1 pb-2">
            <p>Trigger word: <code class="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">{{ training.triggerWord }}</code></p>
            <p>Images: {{ (training.imageUuids || []).length }}</p>
            <p>Epochs: {{ training.config?.epochs ?? 40 }} · Rank: {{ training.config?.rank ?? 32 }} · Checkpoint: {{ training.config?.checkpoint_minutes ?? 30 }} min</p>
            <p class="text-xs text-gray-500">
              Base: Wan2.2-T2V-A14B fp16 (float8 transformer, block swap 32) — outputs load onto the I2V experts.
            </p>
          </div>
        </template>

        <template #outputs>
          <div class="text-sm text-gray-600 dark:text-gray-300 space-y-1 pb-2">
            <template v-if="training.outputLoras && Object.keys(training.outputLoras).length">
              <p v-for="(file, expert) in training.outputLoras" :key="expert">
                {{ expert }}: <code class="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">{{ file }}</code>
              </p>
              <p class="text-xs text-gray-500">
                Published to the loras folder and registered with the trigger word — available in the i2v preset LoRA slots.
              </p>
            </template>
            <p v-else class="text-gray-500">No outputs yet — LoRAs publish when both experts finish.</p>
          </div>
        </template>

        <template #log>
          <pre
            v-if="logTail"
            class="text-xs bg-gray-100 dark:bg-gray-900 rounded p-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-all"
          >{{ logTail }}</pre>
          <p v-else class="text-sm text-gray-500 pb-2">No trainer log yet.</p>
        </template>
      </UAccordion>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          v-if="training && ['training', 'paused', 'failed'].includes(training.status)"
          color="primary"
          variant="soft"
          icon="i-heroicons-beaker"
          :loading="publishing"
          @click="publishLatest"
        >
          Save test LoRA
        </UButton>
        <UButton
          v-if="training && ['training', 'queued'].includes(training.status)"
          color="warning"
          variant="soft"
          icon="i-heroicons-pause"
          @click="act('pause')"
        >
          Pause
        </UButton>
        <UButton
          v-if="training && ['paused', 'failed'].includes(training.status)"
          color="success"
          variant="soft"
          icon="i-heroicons-play"
          @click="act('resume')"
        >
          Resume
        </UButton>
        <UButton
          v-if="training && !['completed', 'canceled'].includes(training.status)"
          color="error"
          variant="soft"
          icon="i-heroicons-x-mark"
          @click="act('cancel')"
        >
          Cancel
        </UButton>
        <UButton variant="ghost" @click="close">Close</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const isOpen = defineModel<boolean>('open', { default: false })
const props = defineProps<{ trainingId: string | null }>()
const emit = defineEmits<{ changed: [] }>()

const { isMobile } = useDevice()
const toast = useToast()

const training = ref<any | null>(null)
const logTail = ref<string | null>(null)
const publishing = ref(false)

const accordionItems = [
  { label: 'Progress', icon: 'i-heroicons-chart-bar', slot: 'progress', defaultOpen: true },
  { label: 'Config', icon: 'i-heroicons-adjustments-horizontal', slot: 'config' },
  { label: 'Output LoRAs', icon: 'i-heroicons-cube', slot: 'outputs' },
  { label: 'Trainer log', icon: 'i-heroicons-document-text', slot: 'log' }
]

const statusColor = (status: string) => {
  switch (status) {
    case 'queued': return 'warning'
    case 'training': return 'info'
    case 'paused': return 'warning'
    case 'completed': return 'success'
    case 'failed': return 'error'
    case 'canceled': return 'neutral'
    default: return 'neutral'
  }
}

const formatDate = (d: string | Date) => new Date(d).toLocaleString()

const close = () => {
  isOpen.value = false
}

const fetchDetail = async () => {
  if (!props.trainingId) return
  try {
    const response = await $fetch<{ training: any, log_tail: string | null }>(`/api/trainings/${props.trainingId}`)
    training.value = response.training
    logTail.value = response.log_tail
  } catch (error: any) {
    toast.add({ title: 'Failed to load training', description: error?.message, color: 'error' })
  }
}

// Snapshot the newest saved epoch(s) into the loras folder for mid-training
// testing — filenames carry the epoch + date, so just load and try them.
const publishLatest = async () => {
  if (!props.trainingId) return
  publishing.value = true
  try {
    const res = await $fetch<{ loras: Record<string, string> }>(`/api/trainings/${props.trainingId}/publish-latest`, { method: 'POST' })
    const names = Object.values(res.loras || {})
    toast.add({
      title: 'Test LoRA saved',
      description: names.length ? `Published to loras: ${names.join(', ')}` : 'Snapshot published to the loras folder.',
      color: 'success'
    })
  } catch (error: any) {
    toast.add({ title: 'Could not save test LoRA', description: error?.data?.statusMessage || error?.message, color: 'error' })
  } finally {
    publishing.value = false
  }
}

const act = async (action: 'pause' | 'resume' | 'cancel') => {
  if (!props.trainingId) return
  try {
    await $fetch(`/api/trainings/${props.trainingId}/${action}`, { method: 'POST' })
    await fetchDetail()
    emit('changed')
  } catch (error: any) {
    toast.add({ title: `${action} failed`, description: error?.data?.statusMessage || error?.message, color: 'error' })
  }
}

// Fetch on open, poll while open + running
let pollTimer: ReturnType<typeof setInterval> | null = null
watch([isOpen, () => props.trainingId], ([open]) => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  training.value = null
  logTail.value = null
  if (open && props.trainingId) {
    fetchDetail()
    pollTimer = setInterval(() => {
      if (training.value && ['queued', 'training'].includes(training.value.status)) fetchDetail()
    }, 5000)
  }
}, { immediate: true })

onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>
