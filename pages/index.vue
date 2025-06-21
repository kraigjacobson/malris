<template>
  <div class="container mx-auto p-6">
    <div class="max-w-4xl mx-auto">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome to AI Job Tracking
        </h1>
        <p class="text-lg text-gray-600 dark:text-gray-400">
          Track and manage your AI job image metadata with powerful search and filtering capabilities.
        </p>
      </div>
      
      <div class="mt-8 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 class="font-semibold mb-4 text-gray-900 dark:text-white text-lg">Current Features:</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ul class="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="text-green-500" />
              Image metadata storage with UUID tracking
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="text-green-500" />
              Subject categorization and tagging
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="text-green-500" />
              Search by filename, purpose, and status
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="text-green-500" />
              Paginated results with customizable page sizes
            </li>
          </ul>
          <ul class="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="text-green-500" />
              Relational data between images and subjects
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="text-green-500" />
              Encrypted media storage with gallery view
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="text-green-500" />
              Job submission and processing
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="text-green-500" />
              Media deletion with confirmation
            </li>
          </ul>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <NuxtLink
          to="/image-meta"
          class="block p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-photo" class="text-blue-600 dark:text-blue-400 text-xl" />
            <div>
              <h3 class="font-medium text-blue-900 dark:text-blue-100">Image Metadata</h3>
              <p class="text-sm text-blue-700 dark:text-blue-300">Browse records</p>
            </div>
          </div>
        </NuxtLink>
        
        <NuxtLink
          to="/media-gallery"
          class="block p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
        >
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-squares-2x2" class="text-green-600 dark:text-green-400 text-xl" />
            <div>
              <h3 class="font-medium text-green-900 dark:text-green-100">Media Gallery</h3>
              <p class="text-sm text-green-700 dark:text-green-300">View images</p>
            </div>
          </div>
        </NuxtLink>
        
        <NuxtLink
          to="/submit-job"
          class="block p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
        >
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-play" class="text-purple-600 dark:text-purple-400 text-xl" />
            <div>
              <h3 class="font-medium text-purple-900 dark:text-purple-100">Submit Job</h3>
              <p class="text-sm text-purple-700 dark:text-purple-300">Process videos</p>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup>
useHead({
  title: 'AI Job Tracking System',
  meta: [
    { name: 'description', content: 'Track and manage AI job image metadata' }
  ]
})
</script>