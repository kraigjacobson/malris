<template>
  <div>
    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <UIcon name="i-heroicons-arrow-path-20-solid" class="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
      <p class="text-gray-500 dark:text-gray-400">Loading subjects...</p>
    </div>

    <!-- No Results -->
    <div v-else-if="hasSearched && subjects.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-face-frown-20-solid" class="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <p class="text-gray-500 dark:text-gray-400">No subjects found</p>
      <p class="text-sm text-gray-400 mt-2">Try adjusting your search terms</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center py-12">
      <UAlert
        color="error"
        title="Error"
        :description="error"
        variant="subtle"
      />
    </div>

    <!-- Grid View -->
    <div v-else class="grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
      <div
        v-for="subject in subjects"
        :key="subject.uuid || subject.id"
        class="cursor-pointer relative"
        :class="{ 'ring-2 ring-blue-500': multiSelect && isSelected(subject) }"
        @click="$emit('subject-click', subject)"
      >
        <!-- Selection Indicator for Multi-Select -->
        <div
          v-if="multiSelect"
          class="absolute top-2 left-2 z-10"
        >
          <div
            class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
            :class="isSelected(subject)
              ? 'bg-blue-500 border-blue-500 text-white'
              : 'bg-white/80 border-gray-300 text-gray-600'"
          >
            <UIcon
              v-if="isSelected(subject)"
              name="i-heroicons-check"
              class="w-4 h-4"
            />
          </div>
        </div>
        <!-- Image Only (only show when displayImages is true) -->
        <div v-if="displayImages" class="aspect-square bg-gray-100 dark:bg-gray-700">
          <img
            v-if="subject.has_thumbnail && subject.thumbnail_data"
            :src="`data:image/jpeg;base64,${subject.thumbnail_data}`"
            :alt="subject.name"
            class="w-full h-full object-cover"
            loading="lazy"
            @error="handleImageError"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <UIcon name="i-heroicons-user-circle" class="text-4xl text-gray-400" />
          </div>
        </div>
        
        <!-- Subject name when images are hidden -->
        <div v-else class="p-3 bg-gray-100 dark:bg-gray-700 rounded">
          <h3 class="font-medium text-sm text-gray-900 dark:text-white text-center">
            {{ subject.name }}
          </h3>
        </div>
      </div>
    </div>

    <!-- Load More Button -->
    <div v-if="hasMore && subjects.length > 0" class="text-center mt-6">
      <UButton
        variant="outline"
        :loading="loadingMore"
        @click="$emit('load-more')"
        class="w-full"
      >
        {{ loadingMore ? 'Loading...' : 'Load More' }}
      </UButton>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  subjects: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  loadingMore: {
    type: Boolean,
    default: false
  },
  hasSearched: {
    type: Boolean,
    default: false
  },
  hasMore: {
    type: Boolean,
    default: false
  },
  error: {
    type: String,
    default: null
  },
  selectionMode: {
    type: Boolean,
    default: false
  },
  multiSelect: {
    type: Boolean,
    default: false
  },
  selectedItems: {
    type: Array,
    default: () => []
  },
  emptyStateMessage: {
    type: String,
    default: null
  },
  displayImages: {
    type: Boolean,
    default: true
  }
})

defineEmits(['subject-click', 'load-more'])

// Check if subject is selected (for multi-select mode)
const isSelected = (subject) => {
  if (!props.multiSelect || !props.selectedItems) return false
  return props.selectedItems.some(item => item.id === subject.id)
}

const handleImageError = (event) => {
  // Hide the broken image and show placeholder instead
  event.target.style.display = 'none'
  
  // Find the parent container and add a placeholder
  const container = event.target.parentElement
  if (container && !container.querySelector('.image-error-placeholder')) {
    const placeholder = document.createElement('div')
    placeholder.className = 'image-error-placeholder w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center'
    placeholder.innerHTML = '<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>'
    container.appendChild(placeholder)
  }
}

</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>