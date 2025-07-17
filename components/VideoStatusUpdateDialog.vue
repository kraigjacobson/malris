<template>
  <UModal v-model:open="isOpen" :ui="{ width: 'max-w-md' }">
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">
          Update Video Status
        </h3>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-heroicons-x-mark-20-solid"
          class="-my-1"
          @click="isOpen = false"
        />
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Status
          </label>
          <USelectMenu
            v-model="selectedStatus"
            :items="statusOptions"
            placeholder="Choose a status..."
            class="w-full"
          />
        </div>
        
        <div v-if="video" class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Video: {{ video.filename }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3">
        <UButton
          color="neutral"
          variant="ghost"
          @click="isOpen = false"
        >
          Cancel
        </UButton>
        <UButton
          color="primary"
          :loading="updating"
          :disabled="!selectedStatus"
          @click="updateStatus"
        >
          Update Status
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  video: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:modelValue', 'status-updated'])

// Modal state
const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// Status options
const statusOptions = [
  { label: 'Bad Source', value: 'BadSource' },
  { label: 'Require Crop', value: 'RequireCrop' },
  { label: 'Require Rotate', value: 'RequireRotate' },
  { label: 'Require Clip', value: 'RequireClip' },
  { label: 'Obstruction', value: 'Obstruction' },
  { label: 'Low Quality', value: 'LowQuality' },
  { label: 'Multiple Subjects', value: 'MultipleSubjects' },
  { label: 'Mark For Deletion', value: 'MarkForDeletion' }
]

// Component state
const selectedStatus = ref(null)
const updating = ref(false)

// Update status function
const updateStatus = async () => {
  if (!selectedStatus.value || !props.video) return

  updating.value = true
  
  try {
    await useApiFetch(`media/${props.video.uuid}/status`, {
      method: 'PUT',
      body: {
        status: selectedStatus.value.value
      }
    })

    // Emit success event
    emit('status-updated', {
      video: props.video,
      status: selectedStatus.value.value
    })

    // Close modal
    isOpen.value = false
    
    // Reset form
    selectedStatus.value = null

  } catch (error) {
    console.error('Failed to update video status:', error)
    // You could add a toast notification here
  } finally {
    updating.value = false
  }
}

// Reset form when modal closes
watch(isOpen, (newValue) => {
  if (!newValue) {
    selectedStatus.value = null
  }
})
</script>