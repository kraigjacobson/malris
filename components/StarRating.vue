<template>
  <div class="star-rating-overlay" :style="{ top: topPosition }">
    <UPopover v-model:open="isPopoverOpen" :content="{ align: 'center', side: 'bottom', sideOffset: 8 }">
      <UButton :icon="currentRating ? 'i-heroicons-star-20-solid' : 'i-heroicons-star'" :color="currentRating ? 'yellow' : 'white'" variant="ghost" size="xl" :loading="isUpdating" class="opacity-80 hover:opacity-100 transition-opacity p-3 min-w-[48px] min-h-[48px] star-icon-shadow" :label="currentRating ? String(currentRating) : undefined" @click.stop @touchstart.stop />

      <template #content>
        <div class="p-4 bg-white dark:bg-gray-800">
          <div class="flex gap-2">
            <UButton v-for="star in [1, 2, 3, 4, 5]" :key="`star-${star}`" :icon="star <= (hoverRating || currentRating || 0) ? 'i-heroicons-star-20-solid' : 'i-heroicons-star'" :color="star <= (hoverRating || currentRating || 0) ? 'yellow' : 'neutral'" variant="ghost" size="xl" class="min-w-[44px] min-h-[44px] p-2" @click.stop.prevent="handleRatingClick(star)" @touchend.stop.prevent="handleTouchRating(star)" @mouseenter="!isTouchDevice && (hoverRating = star)" @mouseleave="!isTouchDevice && (hoverRating = 0)" />
            <UButton v-if="currentRating" icon="i-heroicons-x-mark-20-solid" color="error" variant="ghost" size="xl" class="min-w-[44px] min-h-[44px] p-2" @click.stop.prevent="handleRatingClick(null)" @touchend.stop.prevent="handleTouchRating(null)" title="Clear rating" />
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
  },
  topPosition: {
    type: String,
    default: '8px'
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
  console.log('🌟 [RATING DEBUG] Clicking star:', rating, 'Current rating before update:', currentRating.value)
  await updateRating(rating)
  hoverRating.value = 0
  console.log('🌟 [RATING DEBUG] After update, currentRating is:', currentRating.value)
}

// Handle touch events separately to prevent double-firing
const handleTouchRating = async rating => {
  console.log('🌟 [RATING DEBUG] Touch rating:', rating, 'Current rating before update:', currentRating.value)
  await updateRating(rating)
  hoverRating.value = 0
  console.log('🌟 [RATING DEBUG] After update, currentRating is:', currentRating.value)
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
    console.log('🌟 [RATING DEBUG] Rating prop changed from', currentRating.value, 'to', newRating)
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

// Debug mounted lifecycle
onMounted(() => {
  console.log('🌟 [RATING DEBUG] StarRating mounted with:', {
    mediaUuid: props.mediaUuid,
    initialRating: props.rating,
    currentRating: currentRating.value
  })
})
</script>

<style scoped>
.star-rating-overlay {
  position: absolute;
  right: 8px;
  z-index: 50;
  pointer-events: auto;
}

.star-icon-shadow :deep(svg) {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}
</style>
