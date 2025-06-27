<template>
  <header class="bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
    <div class="container mx-auto px-6 py-4">
      <!-- Top Section with Title and User Info -->
      <div class="flex justify-between items-center mb-4">
        <div>
          <NuxtLink to="/" class="text-2xl font-bold text-neutral-900 dark:text-white hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
            AI Job Tracking System
          </NuxtLink>
        </div>
        
        <div class="flex items-center space-x-4">
          <ClientOnly>
            <div v-if="user" class="flex items-center space-x-4">
              <span class="text-sm text-neutral-600 dark:text-neutral-400">Welcome, {{ user.email }}</span>
              <UButton
                variant="outline"
                size="sm"
                icon="i-heroicons-cog-6-tooth"
                @click="showSettings = true"
              >
                Settings
              </UButton>
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
              class="px-4 py-2 bg-neutral-800 text-white rounded hover:bg-neutral-700 transition-colors"
            >
              Login
            </NuxtLink>
            <template #fallback>
              <div class="px-4 py-2 bg-neutral-800 text-white rounded opacity-50">
                Loading...
              </div>
            </template>
          </ClientOnly>
        </div>
      </div>

      <!-- Navigation Menu -->
      <UNavigationMenu content-orientation="vertical" :items="navigationItems" class="w-full" />
    </div>

    <!-- Settings Slideover -->
    <SettingsSlideOver v-model="showSettings" />
  </header>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

// Supabase authentication re-enabled
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const showSettings = ref(false)

// Navigation items
const navigationItems = ref<NavigationMenuItem[]>([
  {
    label: 'Data Management',
    icon: 'i-heroicons-folder',
    children: [
      {
        label: 'Media Gallery',
        description: 'Browse encrypted media storage with images and videos.',
        icon: 'i-heroicons-squares-2x2',
        to: '/media-gallery'
      },
      {
        label: 'Subjects Gallery',
        description: 'Browse and search subjects with their associated media and hero images.',
        icon: 'i-heroicons-user-group',
        to: '/subjects-gallery'
      }
    ]
  },
  {
    label: 'Job Processing',
    icon: 'i-heroicons-cog-6-tooth',
    children: [
      {
        label: 'Submit Job',
        description: 'Submit video processing jobs to the media server.',
        icon: 'i-heroicons-play',
        to: '/submit-job'
      },
      {
        label: 'Job Queue',
        description: 'Monitor and manage processing jobs with search and filter.',
        icon: 'i-heroicons-queue-list',
        to: '/jobs'
      }
    ]
  }
])

// Handle sign out using Supabase
const handleSignOut = async () => {
  try {
    // Clear login time when signing out
    if (import.meta.client) {
      try {
        const localforage = await import('localforage')
        await localforage.default.removeItem('lastLoginTime')
      } catch (error) {
        console.error('Error clearing login time:', error)
      }
    }
    
    // Sign out from Supabase
    await supabase.auth.signOut()
    console.log('Sign out successful')
    
    // Navigate to login page
    await navigateTo('/login')
  } catch (error) {
    console.error('Error during sign out:', error)
  }
}
</script>