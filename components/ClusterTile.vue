<template>
  <div
    class="relative rounded-lg border-2 overflow-hidden flex flex-col transition"
    :class="[
      isKeeper ? 'border-emerald-500 ring-2 ring-emerald-400/40' : 'border-gray-200 dark:border-gray-700',
      excluded ? 'opacity-40 grayscale' : '',
    ]"
  >
    <!-- Keeper / excluded badges -->
    <div v-if="isKeeper" class="absolute top-1 left-1 z-10 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center gap-1">
      <UIcon name="i-heroicons-star-solid" class="w-3 h-3" /> KEEP
    </div>
    <div v-else-if="excluded" class="absolute top-1 left-1 z-10 px-2 py-0.5 rounded-full bg-gray-600 text-white text-xs font-bold">excluded</div>

    <div class="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-900 min-h-[160px]">
      <MediaItem :media="{ ...media, type: 'image' }" image-size="md" max-height="34vh" :clickable="false" :rounded="false" />
    </div>

    <div class="px-2 py-2 bg-white dark:bg-gray-800">
      <div class="flex items-center justify-between gap-2 mb-1">
        <span
          class="px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-1"
          :class="media.jobCount > 0 ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'"
        >
          <UIcon name="i-heroicons-briefcase" class="w-3 h-3" /> {{ media.jobCount }}
        </span>
        <span class="text-xs text-gray-400">{{ media.width || '?' }}×{{ media.height || '?' }}</span>
        <UIcon v-if="media.favorite" name="i-heroicons-star-solid" class="w-3 h-3 text-yellow-400" />
      </div>
      <p class="text-xs font-mono text-gray-600 dark:text-gray-300 truncate" :title="media.filename">{{ media.filename }}</p>
      <div class="mt-2 flex items-center gap-1 min-h-[28px]">
        <template v-if="!isKeeper">
          <UButton color="success" variant="soft" size="xs" :disabled="busy" class="flex-1 justify-center" @click="$emit('setKeeper')">
            Keep this
          </UButton>
          <UButton :color="excluded ? 'neutral' : 'error'" variant="ghost" size="xs" :disabled="busy" @click="$emit('toggleExclude')">
            {{ excluded ? 'include' : 'exclude' }}
          </UButton>
        </template>
        <span v-else class="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <UIcon name="i-heroicons-check-badge" class="w-4 h-4" /> Keeping this one
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Member {
  uuid: string
  filename: string
  width: number | null
  height: number | null
  jobCount: number
  rating: number | null
  favorite: boolean
}
defineProps<{ media: Member; isKeeper: boolean; excluded: boolean; busy: boolean }>()
defineEmits<{ setKeeper: []; toggleExclude: [] }>()
</script>
