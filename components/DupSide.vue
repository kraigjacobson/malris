<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
    <div class="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
      <span class="font-bold text-lg text-gray-700 dark:text-gray-200">{{ label }}</span>
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <UIcon v-if="media.favorite" name="i-heroicons-star-solid" class="w-4 h-4 text-yellow-400" />
        <span v-if="media.rating">★ {{ media.rating }}</span>
        <span
          class="px-2 py-0.5 rounded font-medium flex items-center gap-1"
          :class="media.jobCount > 0 ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-gray-200 dark:bg-gray-700'"
          :title="`Used in ${media.jobCount} job(s)`"
        >
          <UIcon name="i-heroicons-briefcase" class="w-3 h-3" />
          {{ media.jobCount }} {{ media.jobCount === 1 ? 'job' : 'jobs' }}
        </span>
        <span class="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700">{{ media.purpose }}</span>
      </div>
    </div>

    <div class="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-900 min-h-[300px]">
      <MediaItem :media="{ ...media, type: 'image' }" image-size="lg" max-height="60vh" :clickable="false" :rounded="false" />
    </div>

    <div class="px-4 py-3">
      <p class="text-sm font-mono text-gray-600 dark:text-gray-300 truncate" :title="media.filename">{{ media.filename }}</p>
      <p class="text-xs text-gray-400 mt-1">
        {{ media.width || '?' }}×{{ media.height || '?' }}
        <span class="ml-2 font-mono opacity-60">{{ media.uuid.slice(0, 8) }}</span>
      </p>
      <div class="mt-3 flex justify-end gap-2">
        <UButton
          color="primary"
          variant="soft"
          size="sm"
          :disabled="busy"
          :title="`Move ${label}'s ${media.jobCount} job(s) to the other image, then delete ${label}`"
          @click="$emit('merge')"
        >
          <UIcon name="i-heroicons-arrows-pointing-in" class="mr-1" /> Merge {{ label }} → other
        </UButton>
        <UButton color="error" variant="soft" size="sm" :disabled="busy" @click="$emit('delete')">
          <UIcon name="i-heroicons-trash" class="mr-1" /> Delete {{ label }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface SideInfo {
  uuid: string
  filename: string
  width: number | null
  height: number | null
  purpose: string
  rating: number | null
  favorite: boolean
  jobCount: number
}
defineProps<{ label: string; media: SideInfo; busy: boolean }>()
defineEmits<{ delete: []; merge: [] }>()
</script>
