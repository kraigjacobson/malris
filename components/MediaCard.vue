<template>
  <!-- Thin adapter over <MediaItem>: preserves MediaCard's existing API/emits for
       its consumers (MediaGrid, media-gallery, jobs, JobDetailsModal) while the
       actual image/video/poster/loading logic lives once in MediaItem. -->
  <MediaItem
    :media="media"
    :image-size="imageSize"
    :aspect="aspectRatio === 'auto' ? 'fill' : aspectRatio"
    :show-duration="showDuration"
    :autoplay="autoplay"
    :show-controls="showControls"
    :enable-delete="showDelete"
    :enable-rating="showRating"
    @click="$emit('click')"
    @delete="$emit('delete')"
    @rate="(_media, rating) => $emit('rating-updated', rating)"
  />
</template>

<script setup lang="ts">
import type { MediaItemData } from '~/types'

interface Props {
  media: MediaItemData
  showDuration?: boolean
  autoplay?: boolean
  aspectRatio?: string // 'square' | '3/4' | '16/9' | '4/3' | 'auto' | custom
  imageSize?: string
  showControls?: boolean
  showDelete?: boolean
  showRating?: boolean
}

withDefaults(defineProps<Props>(), {
  showDuration: true,
  autoplay: false,
  aspectRatio: 'square',
  imageSize: 'md',
  showControls: false,
  showDelete: true,
  showRating: true
})

defineEmits<{
  click: []
  delete: []
  'rating-updated': [rating: number]
}>()
</script>
