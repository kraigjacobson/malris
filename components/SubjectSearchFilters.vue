<template>
  <UCollapsible v-model:open="isOpen" class="flex flex-col gap-2">
    <UButton
      label="Subject Search Filters"
      color="neutral"
      variant="subtle"
      trailing-icon="i-lucide-chevron-down"
      block
    />

    <template #content>
      <div class="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <!-- Subject Name Search -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search by Subject Name
          </label>
          <SubjectSearch
            :model-value="selectedSubject"
            placeholder="Search by subject name..."
            :disabled="loading"
            @update:model-value="$emit('subjectSelect', $event)"
            @select="$emit('subjectSelect', $event)"
          />
        </div>

        <!-- Name Category Filters -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Subject Categories
          </label>
          <div class="flex gap-4">
            <UCheckbox
              v-model="searchStore.subjectSearch.nameFilters.celeb"
              label="Celeb"
            />
            <UCheckbox
              v-model="searchStore.subjectSearch.nameFilters.asmr"
              label="ASMR"
            />
            <UCheckbox
              v-model="searchStore.subjectSearch.nameFilters.real"
              label="Real"
            />
          </div>
        </div>

      <!-- Sort Options -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Sort By
        </label>
        <USelectMenu
          v-model="searchStore.subjectSearch.sortOptions"
          :items="sortOptions"
          class="w-full"
        />
      </div>
      
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
          :ui="{ trailing: 'pe-1' }"
        >
          <template v-if="searchStore.subjectSearch.selectedTags?.length" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-lucide-circle-x"
              aria-label="Clear all tags"
              @click="searchStore.subjectSearch.selectedTags = []"
            />
          </template>
        </UInputTags>
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
          v-if="hasActiveFilters"
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
    </template>
  </UCollapsible>
</template>

<script setup>
import { useSearchStore } from '~/stores/search'
import SubjectSearch from '~/components/SubjectSearch.vue'

defineProps({
  loading: {
    type: Boolean,
    default: false
  },
  selectedSubject: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['search', 'clear', 'subjectSelect'])

const searchStore = useSearchStore()

// Collapsible state - start collapsed
const isOpen = ref(false)

// Sort options
const sortOptions = [
  { label: 'Total Jobs (Most)', value: 'total_jobs_desc' },
  { label: 'Total Jobs (Least)', value: 'total_jobs_asc' },
  { label: 'Name (A-Z)', value: 'name_asc' },
  { label: 'Name (Z-A)', value: 'name_desc' },
  { label: 'Created Date (Newest)', value: 'created_at_desc' },
  { label: 'Created Date (Oldest)', value: 'created_at_asc' }
]

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return searchStore.subjectSearch.selectedTags.length > 0 ||
         searchStore.subjectSearch.nameFilters.celeb ||
         searchStore.subjectSearch.nameFilters.asmr ||
         !searchStore.subjectSearch.nameFilters.real
})

const handleSearch = () => {
  emit('search')
}
</script>