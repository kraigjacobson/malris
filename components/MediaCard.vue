<template>
  <div class="bg-neutral-800 overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer relative h-full w-full" :class="aspectRatioClass">
    <!-- Skeleton Loading -->
    <USkeleton v-if="isLoading && displayImages" class="absolute inset-0 w-full h-full z-10" />

    <!-- Image Preview -->
    <div v-if="media.type === 'image'" class="w-full h-full relative" @click="$emit('click')">
      <img v-if="displayImages" :src="getImageUrl(media, 'md')" :alt="media.filename" class="w-full h-full object-cover object-top transition-opacity duration-300" :class="{ 'opacity-0': isLoading }" loading="lazy" @load="handleLoad" @error="handleImageError" />
      <div v-else class="w-full h-full flex items-center justify-center bg-gray-800">
        <UIcon name="i-heroicons-photo" class="text-4xl text-gray-400" />
      </div>
    </div>

    <!-- Video Preview -->
    <div v-else-if="media.type === 'video'" class="w-full h-full relative group" :data-video-uuid="media.uuid" @click="$emit('click')" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
      <template v-if="displayImages">
        <!-- Hidden image to detect poster load -->
        <img v-if="getVideoPosterUrl(media)" :src="getVideoPosterUrl(media)" class="hidden" @load="handleLoad" @error="handleLoad" />

        <!-- Video element -->
        <video ref="videoRef" :poster="getVideoPosterUrl(media)" class="w-full h-full object-cover object-top relative z-20 transition-opacity duration-300" :class="{ 'opacity-0': isLoading && getVideoPosterUrl(media) }" muted loop :preload="autoplay ? 'auto' : 'none'" :autoplay="autoplay" :controls="showControls" playsinline webkit-playsinline disablePictureInPicture>
          <source :src="`/api/stream/${media.uuid}`" type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        <!-- Fallback for videos without thumbnails -->
        <div v-if="!getVideoPosterUrl(media)" class="absolute inset-0 bg-gray-800 flex items-center justify-center z-10">
          <UIcon name="i-heroicons-play-circle" class="text-4xl text-gray-400" />
        </div>

        <!-- Video Duration -->
        <div v-if="showDuration && media.duration" class="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-1.5 py-0.5 rounded z-30">
          {{ formatDuration(media.duration) }}
        </div>
      </template>

      <div v-else class="w-full h-full flex items-center justify-center bg-gray-800">
        <UIcon name="i-heroicons-play-circle" class="text-4xl text-gray-400" />
      </div>
    </div>

    <!-- Fallback -->
    <div v-else class="w-full h-full flex items-center justify-center bg-gray-800" @click="$emit('click')">
      <UIcon name="i-heroicons-document" class="text-4xl text-gray-400" />
    </div>

    <!-- Right side buttons stack - positioned right -->
    <div v-if="showDelete || showRating" class="absolute top-2 right-2 flex flex-col gap-2 items-end z-40">
      <!-- Delete Button -->
      <UButton v-if="showDelete" icon="i-heroicons-x-mark" color="error" variant="ghost" size="xl" class="opacity-80 hover:opacity-100 transition-opacity min-w-[48px] min-h-[48px] !p-0 flex items-center justify-center" @click.stop="handleDelete" square />

      <!-- Star Rating -->
      <StarRating v-if="showRating" :media-uuid="media.uuid" :rating="media.rating" :job-id="media.job_id" @updated="handleRatingUpdated" />
    </div>
  </div>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'

const props = defineProps({
  media: { type: Object, required: true },
  showDuration: { type: Boolean, default: true },
  autoplay: { type: Boolean, default: false },
  aspectRatio: { type: String, default: 'square' }, // 'square', '3/4', '16/9', 'auto', or custom like '4/3'
  showControls: { type: Boolean, default: false }, // Show persistent video controls
  showDelete: { type: Boolean, default: true }, // Show delete button
  showRating: { type: Boolean, default: true } // Show star rating button
})

const emit = defineEmits(['click', 'delete', 'rating-updated'])

const handleDelete = () => {
  emit('delete')
}

const handleRatingUpdated = rating => {
  emit('rating-updated', rating)
}

const settingsStore = useSettingsStore()
const displayImages = computed(() => settingsStore.displayImages)
const videoRef = ref(null)
const isLoading = ref(true)

// Compute aspect ratio class
const aspectRatioClass = computed(() => {
  const aspectMap = {
    square: 'aspect-square',
    '3/4': 'aspect-[3/4]',
    '16/9': 'aspect-video',
    '4/3': 'aspect-[4/3]',
    auto: ''
  }
  return aspectMap[props.aspectRatio] || props.aspectRatio
})

// Helper methods - defined before watch to avoid TDZ errors
const getImageUrl = (media, size = 'md') => {
  if (!media || !media.uuid) return ''
  if (media.thumbnail) return media.thumbnail
  if (media.thumbnail_uuid && media.thumbnail_uuid !== 'undefined' && media.thumbnail_uuid !== 'null') {
    return `/api/media/${media.thumbnail_uuid}/image?size=${size}`
  }
  return `/api/media/${media.uuid}/image?size=${size}`
}

const getVideoPosterUrl = media => {
  if (!media || !media.uuid) return undefined
  if (media.thumbnail) return media.thumbnail
  if (media.thumbnail_uuid && media.thumbnail_uuid !== 'undefined' && media.thumbnail_uuid !== 'null') {
    return `/api/media/${media.thumbnail_uuid}/image?size=md`
  }
  if (media.subject_thumbnail_uuid && media.subject_thumbnail_uuid !== 'undefined' && media.subject_thumbnail_uuid !== 'null') {
    return `/api/media/${media.subject_thumbnail_uuid}/image?size=md`
  }
  return undefined
}

const formatDuration = seconds => {
  if (!seconds) return ''
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m`
}

// Reset loading state when media changes
watch(
  () => props.media.uuid,
  () => {
    isLoading.value = true
    // If no image/poster to load, set loading to false immediately
    if (props.media.type === 'video' && !getVideoPosterUrl(props.media)) {
      isLoading.value = false
    }
  },
  { immediate: true }
)

const handleLoad = () => {
  isLoading.value = false
}

const handleMouseEnter = async () => {
  if (!displayImages.value || !videoRef.value || props.autoplay) return

  try {
    await videoRef.value.play()
  } catch {
    // Ignore play errors (e.g. if user leaves quickly)
  }
}

const handleMouseLeave = () => {
  if (!displayImages.value || !videoRef.value || props.autoplay) return

  videoRef.value.pause()
  videoRef.value.currentTime = 0
}

const handleImageError = e => {
  isLoading.value = false
  e.target.style.display = 'none'
  // Could show placeholder here
}
</script>
