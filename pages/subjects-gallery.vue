<template>
  <UModal v-model:open="isModalOpen" :ui="{ width: 'max-w-6xl' }" :fullscreen="isMobile">
    <template #header>
      <div class="flex justify-between items-center w-full">
        <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
          Subjects
        </h1>
        <div class="flex items-center gap-2">
          <UButton
            @click="openManageSubjectModal()"
            color="primary"
            icon="i-heroicons-plus"
            size="sm"
          >
            Add Subject
          </UButton>
          <UButton
            variant="ghost"
            size="sm"
            icon="i-heroicons-x-mark"
            @click="isModalOpen = false"
          />
        </div>
      </div>
    </template>

    <template #body>
      <div class="space-y-6 max-h-[70vh] overflow-y-auto">
        <!-- Search Filters -->
        <SubjectSearchFilters
          :selected-subject="selectedSearchSubject"
          @search="searchSubjects"
          @clear="clearFilters"
          @subject-select="handleSubjectSelection"
          :loading="isLoading"
        />

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl" />
    </div>

    <!-- Results -->
    <div v-else-if="subjectResults.length > 0">
      <!-- Results Header -->
      <div class="flex justify-between items-center mb-3 sm:mb-4">
        <p class="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Found {{ pagination.total }} subjects
        </p>
        <div class="flex gap-1 sm:gap-2">
          <UButton
            @click="viewMode = 'grid'"
            :variant="viewMode === 'grid' ? 'solid' : 'outline'"
            size="xs"
          >
            <UIcon name="i-heroicons-squares-2x2" />
          </UButton>
          <UButton
            @click="viewMode = 'list'"
            :variant="viewMode === 'list' ? 'solid' : 'outline'"
            size="xs"
          >
            <UIcon name="i-heroicons-list-bullet" />
          </UButton>
        </div>
      </div>

      <!-- Grid View -->
      <div v-if="viewMode === 'grid'">
        <SubjectGrid
          :subjects="subjectResults"
          :loading="false"
          :loading-more="false"
          :has-searched="hasSearched"
          :has-more="false"
          :error="null"
          :selection-mode="false"
          :display-images="settingsStore.displayImages"
          :empty-state-message="'Use the search filters above to find subjects'"
          @subject-click="openManageSubjectModal"
        />
      </div>

      <!-- List View -->
      <div v-else class="space-y-1 sm:space-y-2">
        <div
          v-for="subject in subjectResults"
          :key="subject.id"
          class="bg-neutral-800 rounded-lg p-2 sm:p-4 shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
          @click="openManageSubjectModal(subject)"
        >
          <div class="flex items-center gap-2 sm:gap-4">
            <!-- Thumbnail -->
            <div class="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 dark:bg-gray-700 rounded shrink-0">
              <img
                v-if="subject.has_thumbnail && subject.thumbnail_url && settingsStore.displayImages"
                :src="subject.thumbnail_url"
                :alt="subject.name"
                class="w-full h-full object-cover object-top rounded"
                loading="lazy"
                @error="handleImageError"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <UIcon name="i-heroicons-user-circle" class="text-2xl text-gray-400" />
              </div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-sm sm:text-base text-gray-900 dark:text-white truncate">
                {{ subject.name }}
              </h3>
              <p class="text-xs sm:text-sm text-gray-500 hidden sm:block">
                Created {{ formatDate(subject.created_at) }}
              </p>
              <div v-if="subject.tags && subject.tags.tags && subject.tags.tags.length > 0" class="flex flex-wrap gap-1 mt-1 hidden sm:flex">
                <span
                  v-for="tag in subject.tags.tags.slice(0, 3)"
                  :key="tag"
                  class="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded"
                >
                  {{ tag }}
                </span>
              </div>
              <p v-if="subject.note" class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-1 sm:line-clamp-none hidden sm:block">
                {{ subject.note }}
              </p>
            </div>

            <!-- Actions -->
            <div class="shrink-0 flex items-center gap-2">
              <UIcon name="i-heroicons-chevron-right" class="text-gray-400" />
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- No Results -->
    <div v-else-if="!isLoading && hasSearched" class="text-center py-8">
      <UIcon name="i-heroicons-user-group" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">No subjects found matching your criteria</p>
    </div>

    <!-- Initial State -->
    <div v-else class="text-center py-8">
      <UIcon name="i-heroicons-magnifying-glass" class="text-4xl text-gray-400 mb-4" />
      <p class="text-gray-500">Use the search filters above to find subjects</p>
    </div>


        <!-- Manage Subject Modal -->
        <ManageSubjectModal
          v-model="isManageSubjectModalOpen"
          :subject="selectedSubjectForManagement"
          :subjects="subjectResults"
          :current-subject-index="currentSubjectIndex"
          @subject-created="handleSubjectCreated"
          @subject-updated="handleSubjectUpdated"
          @subject-changed="handleSubjectChanged"
        />
      </div>
    </template>

    <template #footer>
      <div class="w-full space-y-3">
        <!-- Pagination -->
        <div v-if="pagination.total > pagination.limit" class="w-full flex justify-center">
          <UPagination
            v-model:page="currentPage"
            :items-per-page="pagination.limit"
            :total="pagination.total"
            show-last
            show-first
          />
        </div>
        
        <!-- Action Buttons Row -->
        <div class="w-full flex justify-between items-center">
          <!-- Close Button (Left) -->
          <UButton
            @click="isModalOpen = false"
            variant="outline"
            size="sm"
            icon="i-heroicons-x-mark"
          >
            Close
          </UButton>
          
          <!-- Search and Clear Buttons (Right) -->
          <div class="flex gap-3">
            <UButton @click="clearFilters" variant="outline" size="sm">
              Clear
            </UButton>
            <UButton @click="searchSubjects" :loading="isLoading" color="primary" size="sm">
              Search
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup>
import { useSettingsStore } from '~/stores/settings'
import { useSearchStore } from '~/stores/search'
import SubjectSearchFilters from '~/components/SubjectSearchFilters.vue'

// Page metadata
definePageMeta({
  title: 'Subjects Gallery'
})

// Use Nuxt's device detection
const { isMobile } = useDevice()

// Initialize stores
const settingsStore = useSettingsStore()
const searchStore = useSearchStore()

// Date formatting utility
const formatDate = (dateString) => {
  if (!dateString) return 'Unknown'
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return 'Invalid Date'
  }
}

// Image error handler
const handleImageError = (event) => {
  console.warn('Failed to load image:', event.target.src)
  // Hide the broken image
  event.target.style.display = 'none'
}

// Reactive data
const selectedSearchSubject = ref(null)

// Subject search using composable
const { getSubjects } = useSubjects()

const subjectResults = ref([])
const isLoading = ref(false)
const hasSearched = ref(false)
const viewMode = ref('grid')
const isManageSubjectModalOpen = ref(false)
const isModalOpen = ref(true)
const selectedSubjectForManagement = ref(null)
const currentSubjectIndex = ref(0)
const currentPage = ref(1)
const pagination = ref({
  total: 0,
  limit: 16,
  offset: 0,
  has_more: false
})


// Methods
const searchSubjects = async () => {
  isLoading.value = true
  hasSearched.value = true

  try {
    // Parse sort options from search store
    const sortValue = typeof searchStore.subjectSearch.sortOptions === 'object'
      ? searchStore.subjectSearch.sortOptions.value
      : searchStore.subjectSearch.sortOptions
    
    const [sortBy, sortOrder] = sortValue.includes('_')
      ? sortValue.split('_')
      : ['total_jobs', 'desc']

    // Get subjects with new filtering using the composable
    const filteredSubjects = await getSubjects({
      tags: searchStore.subjectSearch.selectedTags,
      nameFilters: searchStore.subjectSearch.nameFilters,
      sortBy,
      sortOrder
    })

    // Apply name filter if a subject is selected
    let finalSubjects = filteredSubjects
    if (selectedSearchSubject.value && selectedSearchSubject.value.label) {
      const searchLower = selectedSearchSubject.value.label.toLowerCase()
      finalSubjects = filteredSubjects.filter(subject =>
        subject.name.toLowerCase().includes(searchLower)
      )
    }

    subjectResults.value = finalSubjects
    
    // Update pagination info
    pagination.value = {
      ...pagination.value,
      total: finalSubjects.length,
      has_more: false
    }
    
  } catch (err) {
    console.error('Search error:', err)
    const toast = useToast()
    
    toast.add({
      title: 'Subjects Search Error',
      description: err.message || 'Failed to search subjects',
      color: 'red',
      timeout: 5000
    })
    
    subjectResults.value = []
  } finally {
    isLoading.value = false
  }
}

const clearFilters = () => {
  selectedSearchSubject.value = null
  searchStore.resetSubjectFilters()
  currentPage.value = 1
  subjectResults.value = []
  hasSearched.value = false
}

const openManageSubjectModal = (subject = null) => {
  selectedSubjectForManagement.value = subject
  
  // Find the index of the selected subject in the results
  if (subject && subjectResults.value.length > 0) {
    const index = subjectResults.value.findIndex(s => s.id === subject.id)
    currentSubjectIndex.value = index !== -1 ? index : 0
  } else {
    currentSubjectIndex.value = 0
  }
  
  isManageSubjectModalOpen.value = true
}

const handleSubjectChanged = ({ subject, index }) => {
  console.log('🔥 [SUBJECTS GALLERY DEBUG] handleSubjectChanged called', { subject, index })
  
  // Update the selected subject and index
  selectedSubjectForManagement.value = subject
  currentSubjectIndex.value = index
  
  console.log('🔥 [SUBJECTS GALLERY DEBUG] Updated selectedSubjectForManagement to:', subject.name)
}

const handleSubjectCreated = (newSubject) => {
  // Update the selected subject for management to the newly created one
  selectedSubjectForManagement.value = newSubject
  
  // Add the new subject to the results if we have searched
  if (hasSearched.value) {
    subjectResults.value.unshift(newSubject)
    pagination.value.total += 1
  }
  
  const toast = useToast()
  toast.add({
    title: 'Success',
    description: 'Subject created successfully',
    color: 'green',
    timeout: 3000
  })
}

const handleSubjectUpdated = (updatedSubject) => {
  // Update the subject in the results list
  const subjectIndex = subjectResults.value.findIndex(s => s.id === updatedSubject.id)
  if (subjectIndex !== -1) {
    subjectResults.value[subjectIndex] = { ...subjectResults.value[subjectIndex], ...updatedSubject }
  }
  
  const toast = useToast()
  toast.add({
    title: 'Success',
    description: 'Subject updated successfully',
    color: 'green',
    timeout: 3000
  })
}

// Watch for page changes
watch(currentPage, (newPage, oldPage) => {
  if (newPage !== oldPage && hasSearched.value) {
    searchSubjects()
  }
})

// Initialize settings on mount (subjects cache is handled globally in app.vue)
onMounted(async () => {
  await settingsStore.initializeSettings()
})

// Page head
useHead({
  title: 'Subjects Gallery - AI Job Tracking System',
  meta: [
    { name: 'description', content: 'Browse and search subjects with their associated media' }
  ]
})
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>