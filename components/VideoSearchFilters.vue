<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">Video Search Filters</h4>
        <UButton
          variant="ghost"
          size="xs"
          :icon="isCollapsed ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'"
          @click="toggleCollapse"
        />
      </div>
    </template>
    
    <div v-show="!isCollapsed" class="space-y-2">
      <!-- Tags and Hide Used in one row -->
      <div class="grid grid-cols-1 gap-2">
        <UInputTags
          v-model="searchStore.videoSearch.selectedTags"
          placeholder="Add tags (e.g., 1girl, long_hair, anime)"
          class="w-full"
          enterkeyhint="enter"
          inputmode="text"
          size="sm"
        />
        <UCheckbox
          v-model="searchStore.videoSearch.excludeAssignedVideos"
          label="Hide Used"
          class="text-xs"
        />
      </div>
      
      <!-- Duration, Sort, and Limit in compact grid -->
      <div class="grid grid-cols-4 gap-2 items-end">
        <UInput
          v-model.number="searchStore.videoSearch.durationFilters.min_duration"
          type="number"
          placeholder="Min (sec)"
          min="0"
          class="w-full"
          size="sm"
        />
        <UInput
          v-model.number="searchStore.videoSearch.durationFilters.max_duration"
          type="number"
          placeholder="Max (sec)"
          min="0"
          class="w-full"
          size="sm"
        />
        <USelectMenu
          v-model="searchStore.videoSearch.sortOptions"
          :items="sortOptionsItems"
          class="w-full"
          size="sm"
          placeholder="Sort"
        />
        <USelectMenu
          v-model="searchStore.videoSearch.limitOptions"
          :items="limitOptionsItems"
          class="w-full"
          size="sm"
          placeholder="Limit"
        />
      </div>
      
    </div>
  </UCard>
</template>

<script setup>
import { useSearchStore } from '~/stores/search'

defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})


const searchStore = useSearchStore()

// Collapse state
const isCollapsed = ref(false)

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}


// Sort options
const sortOptionsItems = [
  { label: 'Random', value: 'random' },
  { label: 'Created Date (Newest)', value: 'created_at_desc' },
  { label: 'Created Date (Oldest)', value: 'created_at_asc' },
  { label: 'Updated Date (Newest)', value: 'updated_at_desc' },
  { label: 'Updated Date (Oldest)', value: 'updated_at_asc' },
  { label: 'Duration (Shortest)', value: 'duration_asc' },
  { label: 'Duration (Longest)', value: 'duration_desc' },
  { label: 'File Size (Largest)', value: 'file_size_desc' },
  { label: 'File Size (Smallest)', value: 'file_size_asc' },
  { label: 'Filename (A-Z)', value: 'filename_asc' },
  { label: 'Filename (Z-A)', value: 'filename_desc' }
]

// Limit options
const limitOptionsItems = [
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '200', value: 200 },
  { label: '500', value: 500 }
]
</script>