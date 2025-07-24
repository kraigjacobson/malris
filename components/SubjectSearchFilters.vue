<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white">Subject Search Filters</h4>
        <UButton
          variant="ghost"
          size="xs"
          :icon="isCollapsed ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-up'"
          @click="toggleCollapse"
        />
      </div>
    </template>
    
    <div v-show="!isCollapsed" class="space-y-3">
      <!-- Tags Search -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Search by Tags
        </label>
        <UInputTags
          v-model="searchStore.subjectSearch.selectedTags"
          placeholder="Add tags (e.g., portrait, landscape)"
          class="w-full"
          enterkeyhint="enter"
        />
      </div>
      
      <!-- Search and Clear Buttons -->
      <div class="flex justify-center gap-3 mt-3">
        <UButton
          color="primary"
          size="sm"
          icon="i-heroicons-magnifying-glass"
          @click="handleSearch"
          :loading="loading"
        >
          Search Subjects
        </UButton>
        <UButton
          v-if="searchStore.subjectSearch.selectedTags.length > 0"
          color="gray"
          variant="outline"
          size="sm"
          icon="i-heroicons-x-mark"
          @click="$emit('clear')"
        >
          Clear
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
</script>