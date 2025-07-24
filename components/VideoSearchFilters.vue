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
    
    <div v-show="!isCollapsed" class="space-y-3">
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Search by Tags
      </label>
      <UInputTags
        v-model="searchStore.videoSearch.selectedTags"
        placeholder="Add tags (e.g., 1girl, long_hair, anime)"
        class="w-full"
        enterkeyhint="enter"
        inputmode="text"
      />
    </div>
    
    <!-- Job Assignment Filter -->
    <div>
      <UCheckbox
        v-model="searchStore.videoSearch.excludeAssignedVideos"
        label="Hide Used"
        class="text-sm"
      />
    </div>
    
    <!-- Duration Filters -->
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Min Duration (seconds)
        </label>
        <UInput
          v-model.number="searchStore.videoSearch.durationFilters.min_duration"
          type="number"
          placeholder="0"
          min="0"
          class="w-full"
          size="sm"
        />
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Max Duration (seconds)
        </label>
        <UInput
          v-model.number="searchStore.videoSearch.durationFilters.max_duration"
          type="number"
          placeholder="No limit"
          min="0"
          class="w-full"
          size="sm"
        />
      </div>
    </div>
    
    <!-- Sort Options -->
    <div>
      <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        Sort By
      </label>
      <USelectMenu
        v-model="searchStore.videoSearch.sortOptions"
        :items="sortOptionsItems"
        class="w-full"
        size="sm"
      />
    </div>
    
    <!-- Search and Clear Buttons -->
    <div class="mt-3 flex gap-2">
      <UButton
        color="primary"
        size="sm"
        @click="handleSearch"
        :loading="loading"
      >
        Search Videos
      </UButton>
      <UButton
        variant="outline"
        size="sm"
        @click="$emit('clear')"
      >
        Clear Filters
      </UButton>
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

const emit = defineEmits(['search', 'clear'])

const searchStore = useSearchStore()

// Collapse state
const isCollapsed = ref(false)

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// Auto-collapse when search is performed
const handleSearch = () => {
  emit('search')
  isCollapsed.value = true
}

// Sort options
const sortOptionsItems = [
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
</script>