<template>
  <div>
    <!-- Loading State -->
    <div v-if="loading && mediaResults.length === 0">
      <!-- Skeleton Grid -->
      <div class="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
        <USkeleton v-for="i in 24" :key="`skeleton-${i}`" class="aspect-[3/4] w-full" />
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="mediaResults.length > 0">
      <!-- Grid View -->
      <div class="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
        <div v-for="media in mediaResults" :key="media.uuid" class="bg-neutral-800 overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer relative" :class="{ 'ring-2 ring-blue-500': multiSelect && isSelected(media) }" @click="handleMediaClick(media)">
          <MediaCard :media="media" class="aspect-[3/4]" :class="{ 'opacity-50': updatedVideoStatuses.has(media.uuid) }">
            <template #overlays>
              <!-- Selection Indicator for Multi-Select -->
              <div v-if="multiSelect" class="absolute top-2 left-2 z-10">
                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors" :class="isSelected(media) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white/80 border-gray-300 text-gray-600'">
                  <UIcon v-if="isSelected(media)" name="i-heroicons-check" class="w-4 h-4" />
                </div>
              </div>

              <!-- Status Update Button (only show in selection mode) -->
              <div v-if="selectionMode && media.type === 'video'" class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <UButton color="white" variant="solid" size="xs" icon="i-heroicons-cog-6-tooth" @click.stop="openStatusDialog(media)" />
              </div>
            </template>
          </MediaCard>
        </div>
      </div>
    </div>

    <!-- No Results -->
    <div v-else-if="!loading && hasSearched" class="text-center py-8">
      <UIcon name="i-heroicons-photo" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">No media found matching your criteria</p>
    </div>

    <!-- Initial State -->
    <div v-else class="text-center py-8">
      <UIcon name="i-heroicons-magnifying-glass" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">Use the search filters above to find media</p>
    </div>

    <!-- Status Update Dialog -->
    <VideoStatusUpdateDialog v-model="showStatusDialog" :video="selectedVideoForStatus" @status-updated="handleStatusUpdated" />
  </div>
</template>

<script setup>
import VideoStatusUpdateDialog from './VideoStatusUpdateDialog.vue'
import MediaCard from '~/components/MediaCard.vue'

const props = defineProps({
  mediaResults: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  hasSearched: {
    type: Boolean,
    default: false
  },
  selectionMode: {
    type: Boolean,
    default: false
  },
  multiSelect: {
    type: Boolean,
    default: false
  },
  selectedItems: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['media-click', 'video-status-updated'])

// Status dialog state
const showStatusDialog = ref(false)
const selectedVideoForStatus = ref(null)
const updatedVideoStatuses = ref(new Set())

// Handle media click
const handleMediaClick = media => {
  emit('media-click', media)
}

// Check if media is selected (for multi-select mode)
const isSelected = media => {
  if (!props.multiSelect || !props.selectedItems) return false
  return props.selectedItems.some(item => item.uuid === media.uuid)
}

// Handle status dialog
const openStatusDialog = video => {
  selectedVideoForStatus.value = video
  showStatusDialog.value = true
}

const handleStatusUpdated = data => {
  // Add video UUID to updated statuses set to grey it out
  updatedVideoStatuses.value.add(data.video.uuid)

  // Emit event to parent component if needed
  emit('video-status-updated', data)
}

// Cleanup function (kept for compatibility, though MediaCard handles most cleanup)
const cleanupVideos = () => {
  // MediaCard handles video cleanup on unmount/mouseleave
}

// Expose cleanup function
defineExpose({
  cleanupVideos
})
</script>
