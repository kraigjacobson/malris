<template>
  <div class="container mx-auto px-4 py-6 max-w-5xl">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">LoRA Training</h1>
      <UButton icon="i-heroicons-plus" @click="openNewModal">
        New Training
      </UButton>
    </div>

    <!-- Loading -->
    <div v-if="loading && trainings.length === 0" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-3xl text-gray-400" />
    </div>

    <!-- Empty -->
    <div v-else-if="trainings.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
      <UIcon name="i-heroicons-academic-cap" class="text-4xl mb-2" />
      <p>No training runs yet. Create one to train a character LoRA from a subject's images.</p>
    </div>

    <!-- Training list -->
    <div v-else class="space-y-3">
      <div
        v-for="training in trainings"
        :key="training.id"
        class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
        @click="openDetails(training)"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium truncate">{{ training.loraName }}</span>
              <UBadge :color="statusColor(training.status)" variant="solid" size="xs">
                {{ training.status }}
              </UBadge>
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {{ training.subjectName || 'Unknown subject' }}
              · {{ (training.imageUuids || []).length }} images
              · trigger “{{ training.triggerWord }}”
              · {{ formatDate(training.createdAt) }}
            </div>
            <!-- Progress bar while running -->
            <div v-if="training.status === 'training' && (training.progress ?? 0) < 100" class="flex items-center gap-2 mt-2">
              <div class="flex-1 max-w-xs bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                <div class="bg-blue-600 h-1 rounded-full transition-all" :style="{ width: `${training.progress || 0}%` }" />
              </div>
              <span class="text-xs text-gray-500">{{ training.progress || 0 }}%</span>
            </div>
            <div v-if="training.status === 'failed' && training.errorMessage" class="text-xs text-red-500 mt-1 truncate">
              {{ training.errorMessage }}
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0" @click.stop>
            <UButton
              v-if="['training', 'paused', 'failed'].includes(training.status)"
              icon="i-heroicons-beaker"
              variant="ghost"
              color="primary"
              size="sm"
              :loading="publishingId === training.id"
              title="Save latest epoch as a test LoRA"
              @click="publishLatest(training)"
            />
            <UButton
              v-if="['training', 'queued'].includes(training.status)"
              icon="i-heroicons-pause"
              variant="ghost"
              size="sm"
              title="Pause (checkpoints, resumable)"
              @click="pauseTraining(training)"
            />
            <UButton
              v-if="['paused', 'failed'].includes(training.status)"
              icon="i-heroicons-play"
              variant="ghost"
              size="sm"
              title="Resume from checkpoint"
              @click="resumeTraining(training)"
            />
            <UButton
              v-if="!['completed', 'canceled'].includes(training.status)"
              icon="i-heroicons-x-mark"
              variant="ghost"
              color="error"
              size="sm"
              title="Cancel"
              @click="cancelTraining(training)"
            />
            <UButton
              v-if="['completed', 'failed', 'canceled', 'paused'].includes(training.status)"
              icon="i-heroicons-trash"
              variant="ghost"
              color="error"
              size="sm"
              title="Delete run (keeps published LoRAs)"
              @click="deleteTraining(training)"
            />
          </div>
        </div>
      </div>
    </div>

    <NewTrainingModal v-model:open="showNewModal" @created="fetchTrainings" />
    <TrainingDetailsModal
      v-model:open="showDetailsModal"
      :training-id="detailsTrainingId"
      @changed="fetchTrainings"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ title: 'Training' })

const toast = useToast()
const { confirm } = useConfirmDialog()

const trainings = ref<any[]>([])
const loading = ref(false)
const showNewModal = ref(false)
const showDetailsModal = ref(false)
const detailsTrainingId = ref<string | null>(null)
const publishingId = ref<string | null>(null)

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

const fetchTrainings = async () => {
  loading.value = true
  try {
    const response = await $fetch<{ trainings: any[] }>('/api/trainings')
    trainings.value = response.trainings
  } catch (error: any) {
    toast.add({ title: 'Failed to load trainings', description: error?.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

const openNewModal = () => {
  showNewModal.value = true
}

const openDetails = (training: any) => {
  detailsTrainingId.value = training.id
  showDetailsModal.value = true
}

// Snapshot the newest saved epoch into the loras folder for mid-training
// testing, without opening the details modal.
const publishLatest = async (training: any) => {
  publishingId.value = training.id
  try {
    const res = await $fetch<{ loras: Record<string, string> }>(`/api/trainings/${training.id}/publish-latest`, { method: 'POST' })
    const names = Object.values(res.loras || {})
    toast.add({
      title: 'Test LoRA saved',
      description: names.length ? `Published to loras: ${names.join(', ')}` : 'Snapshot published to the loras folder.',
      color: 'success'
    })
  } catch (error: any) {
    toast.add({ title: 'Could not save test LoRA', description: error?.data?.statusMessage || error?.message, color: 'error' })
  } finally {
    publishingId.value = null
  }
}

const pauseTraining = async (training: any) => {
  try {
    await $fetch(`/api/trainings/${training.id}/pause`, { method: 'POST' })
    toast.add({ title: 'Training pausing', description: 'Checkpointed — resume any time.', color: 'success' })
    await fetchTrainings()
  } catch (error: any) {
    toast.add({ title: 'Pause failed', description: error?.data?.statusMessage || error?.message, color: 'error' })
  }
}

const resumeTraining = async (training: any) => {
  try {
    await $fetch(`/api/trainings/${training.id}/resume`, { method: 'POST' })
    toast.add({ title: 'Training requeued', description: 'It will resume from its last checkpoint.', color: 'success' })
    await fetchTrainings()
  } catch (error: any) {
    toast.add({ title: 'Resume failed', description: error?.data?.statusMessage || error?.message, color: 'error' })
  }
}

const cancelTraining = async (training: any) => {
  const ok = await confirm({
    title: 'Cancel training?',
    message: `Cancel "${training.loraName}"? Checkpoints are kept until the run is deleted.`,
    confirmLabel: 'Cancel training',
    cancelLabel: 'Keep running',
    variant: 'error'
  })
  if (!ok) return
  try {
    await $fetch(`/api/trainings/${training.id}/cancel`, { method: 'POST' })
    await fetchTrainings()
  } catch (error: any) {
    toast.add({ title: 'Cancel failed', description: error?.data?.statusMessage || error?.message, color: 'error' })
  }
}

const deleteTraining = async (training: any) => {
  const ok = await confirm({
    title: 'Delete training run?',
    message: `Delete "${training.loraName}"? Removes its dataset, checkpoints and logs. Published LoRAs in the loras folder are kept.`,
    confirmLabel: 'Delete',
    cancelLabel: 'Keep',
    variant: 'error'
  })
  if (!ok) return
  try {
    await $fetch(`/api/trainings/${training.id}/delete`, { method: 'DELETE' })
    await fetchTrainings()
  } catch (error: any) {
    toast.add({ title: 'Delete failed', description: error?.data?.statusMessage || error?.message, color: 'error' })
  }
}

// Poll while anything is queued/training so progress stays live
let pollTimer: ReturnType<typeof setInterval> | null = null
const hasActive = computed(() => trainings.value.some(t => ['queued', 'training'].includes(t.status)))

watch(hasActive, (active) => {
  if (active && !pollTimer) {
    pollTimer = setInterval(fetchTrainings, 5000)
  } else if (!active && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}, { immediate: true })

onMounted(fetchTrainings)
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>
