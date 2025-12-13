<template>
  <div class="star-rating-wrapper">
    <UPopover v-model:open="isPopoverOpen" :content="{ align: 'center', side: 'bottom', sideOffset: 8 }">
      <UButton :icon="currentRating ? 'i-heroicons-star-20-solid' : 'i-heroicons-star'" :color="currentRating ? 'yellow' : 'white'" variant="ghost" size="xl" :loading="isUpdating" class="opacity-80 hover:opacity-100 transition-opacity !p-0 min-w-[48px] min-h-[48px] star-icon-shadow flex items-center justify-center" :label="currentRating ? String(currentRating) : undefined" @click.stop @touchstart.stop @touchend.stop @touchmove.stop />

      <template #content>
        <div class="p-4 bg-white dark:bg-gray-800">
          <div class="flex gap-2">
            <UButton v-if="currentRating" icon="i-heroicons-x-mark-20-solid" color="error" variant="ghost" size="xl" class="min-w-[44px] min-h-[44px] p-2" @click.stop.prevent="handleRatingClick(null)" @touchstart.stop @touchend.stop.prevent="handleTouchRating(null)" @touchmove.stop title="Clear rating" />
            <UButton v-for="star in [1, 2, 3, 4, 5]" :key="`star-${star}`" :icon="star <= (hoverRating || currentRating || 0) ? 'i-heroicons-star-20-solid' : 'i-heroicons-star'" :color="star <= (hoverRating || currentRating || 0) ? 'yellow' : 'neutral'" variant="ghost" size="xl" class="min-w-[44px] min-h-[44px] p-2" @click.stop.prevent="handleRatingClick(star)" @touchstart.stop @touchend.stop.prevent="handleTouchRating(star)" @touchmove.stop @mouseenter="!isTouchDevice && (hoverRating = star)" @mouseleave="!isTouchDevice && (hoverRating = 0)" />
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup>
const props = defineProps({
  mediaUuid: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    default: null
  },
  jobId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['updated', 'popover-opened', 'popover-closed'])

const currentRating = ref(props.rating)
const hoverRating = ref(0)
const isUpdating = ref(false)
const isPopoverOpen = ref(false)
const isTouchDevice = ref(false)

// Detect if this is a touch device
onMounted(() => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
})

// Handle rating click with proper state management
const handleRatingClick = async rating => {
  if (isTouchDevice.value) return // Ignore clicks on touch devices
  await updateRating(rating)
  hoverRating.value = 0
}

// Handle touch events separately to prevent double-firing
const handleTouchRating = async rating => {
  await updateRating(rating)
  hoverRating.value = 0
}

const updateRating = async rating => {
  isUpdating.value = true
  const toast = useToast()

  try {
    const body = {
      rating
    }

    if (props.jobId) {
      body.cascade_to_dest = true
      body.job_id = props.jobId
    }

    await useApiFetch(`media/${props.mediaUuid}/rating`, {
      method: 'PUT',
      body
    })

    currentRating.value = rating

    toast.add({
      title: 'Rating Updated',
      description: rating ? `Set rating to ${rating} stars` : 'Rating cleared',
      color: 'success',
      duration: 2000
    })

    emit('updated', rating)

    isPopoverOpen.value = false
  } catch (error) {
    console.error('Failed to update rating:', error)
    toast.add({
      title: 'Update Failed',
      description: 'Failed to update rating. Please try again.',
      color: 'error',
      duration: 3000
    })
  } finally {
    isUpdating.value = false
  }
}

// Watch for rating prop changes
watch(
  () => props.rating,
  newRating => {
    currentRating.value = newRating
  },
  { immediate: true }
)

// Watch for popover state changes to emit events
watch(isPopoverOpen, newValue => {
  if (newValue) {
    emit('popover-opened')
  } else {
    emit('popover-closed')
  }
})
</script>

<style scoped>
.star-rating-wrapper {
  pointer-events: auto;
}

.star-icon-shadow :deep(svg) {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}
</style>
