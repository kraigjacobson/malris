<template>
  <div>
    <!-- Collapsible Header -->
    <div
      class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      @click="toggleCollapse"
    >
      <h4 class="text-sm font-medium text-gray-900 dark:text-white">Video Search Filters</h4>
      <UIcon
        :name="isCollapsed ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'"
        class="w-4 h-4 text-gray-500"
      />
    </div>
    
    <!-- Collapsible Content -->
    <UCard v-show="!isCollapsed" class="mt-2">
      <div class="space-y-2">
        <!-- Tags and Hide Used in one row -->
        <div class="grid grid-cols-1 gap-2">
          <UInputTags
            v-model="searchStore.videoSearch.selectedTags"
            placeholder="Add tags (e.g., 1girl, long_hair, anime)"
            class="w-full"
            enterkeyhint="enter"
            inputmode="text"
            size="sm"
            :ui="{ trailing: 'pe-1' }"
          >
            <template v-if="searchStore.videoSearch.selectedTags?.length" #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-circle-x"
                aria-label="Clear all tags"
                @click="searchStore.videoSearch.selectedTags = []"
              />
            </template>
          </UInputTags>
          <UCheckbox
            v-model="searchStore.videoSearch.excludeAssignedVideos"
            label="Hide Used"
            class="text-xs"
          />
        </div>
        
        <!-- Duration filters -->
        <div class="grid grid-cols-2 gap-2 items-end">
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
        </div>
        
        <!-- Sort and Limit options -->
        <div class="grid gap-2 items-end" style="grid-template-columns: 2fr 1fr 1fr;">
          <USelect
            v-model="searchStore.videoSearch.sortType"
            :items="sortTypeItems"
            class="w-full"
            size="sm"
            placeholder="Sort By"
            @update:model-value="handleSortTypeChange"
          />
          <USelect
            v-model="searchStore.videoSearch.sortOrder"
            :items="sortOrderItems"
            class="w-full"
            size="sm"
            placeholder="Order"
            @update:model-value="handleSortOrderChange"
          />
          <USelect
            v-model="searchStore.videoSearch.limitOptions"
            :items="limitOptionsItems"
            class="w-full"
            size="sm"
            placeholder="Limit"
            @update:model-value="handleLimitChange"
          />
        </div>
      </div>
    </UCard>
  </div>
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

// Collapse state - start collapsed to save space
const isCollapsed = ref(true)

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

const collapse = () => {
  isCollapsed.value = true
}

const expand = () => {
  isCollapsed.value = false
}

// Handle explicit change events to ensure reactivity on mobile
const handleSortTypeChange = (value) => {
  console.log('🔄 Sort type changed to:', value)
  searchStore.videoSearch.sortType = value
}

const handleSortOrderChange = (value) => {
  console.log('🔄 Sort order changed to:', value)
  searchStore.videoSearch.sortOrder = value
}

const handleLimitChange = (value) => {
  console.log('🔄 Limit changed to:', value)
  searchStore.videoSearch.limitOptions = value
}

// Expose methods to parent component
defineExpose({
  isCollapsed,
  toggleCollapse,
  collapse,
  expand
})


// Sort type options (separate from order)
const sortTypeItems = [
  { label: 'Random', value: 'random' },
  { label: 'Created Date', value: 'created_at' },
  { label: 'Updated Date', value: 'updated_at' },
  { label: 'Duration', value: 'duration' },
  { label: 'File Size', value: 'file_size' },
  { label: 'Filename', value: 'filename' }
]

// Sort order options
const sortOrderItems = [
  { label: 'Asc', value: 'asc' },
  { label: 'Desc', value: 'desc' }
]

// Limit options
const limitOptionsItems = [
  { label: '24', value: 24 },
  { label: '48', value: 48 },
  { label: '96', value: 96 },
  { label: '192', value: 192 },
  { label: '480', value: 480 }
]
</script>