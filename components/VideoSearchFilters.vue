<template>
  <UCollapsible v-model:open="isOpen" class="flex flex-col gap-2">
    <UButton
      label="Video Search Filters"
      color="neutral"
      variant="subtle"
      trailing-icon="i-lucide-chevron-down"
      block
    />

    <template #content>
      <div class="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
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
    </template>
  </UCollapsible>
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

// Collapsible state - start collapsed
const isOpen = ref(false)

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

// No need to expose collapse methods with UCollapsible


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