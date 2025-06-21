<template>
  <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
    <div class="container mx-auto px-6 py-4">
      <!-- Top Section with Title and User Info -->
      <div class="flex justify-between items-center mb-4">
        <div>
          <NuxtLink to="/" class="text-2xl font-bold text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            AI Job Tracking System
          </NuxtLink>
        </div>
        
        <div class="flex items-center space-x-4">
          <div v-if="user" class="flex items-center space-x-4">
            <span class="text-sm text-gray-600 dark:text-gray-400">Welcome, {{ user.email }}</span>
            <UButton
              variant="outline"
              size="sm"
              @click="handleSignOut"
            >
              Sign Out
            </UButton>
          </div>
          <NuxtLink
            v-else
            to="/login"
            class="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Login
          </NuxtLink>
        </div>
      </div>

      <!-- Navigation Menu -->
      <UNavigationMenu :items="navigationItems" class="w-full" />
    </div>
  </header>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const user = useSupabaseUser()
const supabase = useSupabaseClient()

// Navigation items
const navigationItems = ref<NavigationMenuItem[]>([
  {
    label: 'Data Management',
    icon: 'i-heroicons-folder',
    children: [
      {
        label: 'Image Metadata',
        description: 'Browse, search, and filter AI job image records with pagination support.',
        icon: 'i-heroicons-photo',
        to: '/image-meta'
      },
      {
        label: 'Media Gallery',
        description: 'Browse encrypted media storage with images and videos.',
        icon: 'i-heroicons-squares-2x2',
        to: '/media-gallery'
      }
    ]
  },
  {
    label: 'Job Processing',
    icon: 'i-heroicons-cog-6-tooth',
    children: [
      {
        label: 'Submit Job',
        description: 'Submit test or video processing jobs to the AI system.',
        icon: 'i-heroicons-play',
        to: '/submit-job'
      }
    ]
  }
])

// Handle sign out
const handleSignOut = async () => {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>