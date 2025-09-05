<template>
  <header class="bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
    <div class="container mx-auto px-3 sm:px-6 py-2 sm:py-4">
      <!-- Top Section with Title and User Info -->
      <div class="flex justify-between items-center mb-2 sm:mb-4">
        <div>
          <NuxtLink to="/" class="text-lg sm:text-2xl font-bold text-neutral-900 dark:text-white hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors">
            <span>Malris</span>
          </NuxtLink>
        </div>
        
        <div class="flex items-center space-x-1 sm:space-x-4">
          <!-- Worker Health Indicator with System Status Popover -->
          <ClientOnly>
            <UPopover>
              <UButton variant="ghost" size="xs" class="p-0">
                <WorkerHealthIndicator />
              </UButton>
              
              <template #content>
                <div class="p-4 w-80">
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">System Status</h3>
                  <div v-if="jobsStore.systemStatus" class="grid grid-cols-1 gap-3 text-xs">
                    <!-- Overall System Health -->
                    <div class="flex items-center gap-2">
                      <UIcon
                        :name="getSystemHealthIcon(jobsStore.systemStatus.systemHealth)"
                        :class="getSystemHealthColor(jobsStore.systemStatus.systemHealth)"
                        class="w-4 h-4"
                      />
                      <span class="font-medium">System:</span>
                      <span :class="getSystemHealthColor(jobsStore.systemStatus.systemHealth)">
                        {{ jobsStore.systemStatus.systemHealth.toUpperCase() }}
                      </span>
                    </div>
                    
                    <!-- RunPod Worker Status -->
                    <div class="flex items-center gap-2">
                      <UIcon
                        :name="getWorkerStatusIcon(jobsStore.systemStatus.runpodWorker.status)"
                        :class="getWorkerStatusColor(jobsStore.systemStatus.runpodWorker.status)"
                        class="w-4 h-4"
                      />
                      <span class="font-medium">RunPod:</span>
                      <span :class="getWorkerStatusColor(jobsStore.systemStatus.runpodWorker.status)">
                        {{ jobsStore.systemStatus.runpodWorker.status.toUpperCase() }}
                      </span>
                    </div>
                    
                    <!-- ComfyUI Status -->
                    <div class="flex items-center gap-2">
                      <UIcon
                        :name="getWorkerStatusIcon(jobsStore.systemStatus.comfyui.status)"
                        :class="getWorkerStatusColor(jobsStore.systemStatus.comfyui.status)"
                        class="w-4 h-4"
                      />
                      <span class="font-medium">ComfyUI:</span>
                      <span :class="getWorkerStatusColor(jobsStore.systemStatus.comfyui.status)">
                        {{ jobsStore.systemStatus.comfyui.status.toUpperCase() }}
                      </span>
                    </div>
                    
                    <!-- ComfyUI Processing Status -->
                    <div class="flex items-center gap-2">
                      <UIcon
                        :name="getProcessingStatusIcon(jobsStore.systemStatus.comfyuiProcessing.status)"
                        :class="getProcessingStatusColor(jobsStore.systemStatus.comfyuiProcessing.status)"
                        class="w-4 h-4"
                      />
                      <span class="font-medium">Processing:</span>
                      <span :class="getProcessingStatusColor(jobsStore.systemStatus.comfyuiProcessing.status)">
                        {{ jobsStore.systemStatus.comfyuiProcessing.status.toUpperCase() }}
                      </span>
                    </div>
                  </div>
                  <div v-else class="text-xs text-gray-500 dark:text-gray-400">
                    System status not available
                  </div>
                </div>
              </template>
            </UPopover>
          </ClientOnly>
          
          <ClientOnly>
            <div v-if="user" class="flex items-center space-x-1 sm:space-x-4">
              <span class="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 hidden md:inline">Welcome, Kraig</span>
              <UButton
                variant="outline"
                size="sm"
                icon="i-heroicons-cog-6-tooth"
                @click="showSettings = true"
              >
                <span class="hidden sm:inline">Settings</span>
              </UButton>
              <UButton
                variant="outline"
                size="xs"
                @click="handleSignOut"
              >
                <span class="hidden sm:inline">Sign Out</span>
                <span class="sm:hidden">Out</span>
              </UButton>
            </div>
            <NuxtLink
              v-else
              to="/login"
              class="px-2 py-1 sm:px-4 sm:py-2 bg-neutral-800 text-white rounded hover:bg-neutral-700 transition-colors text-sm"
            >
              Login
            </NuxtLink>
            <template #fallback>
              <div class="px-2 py-1 sm:px-4 sm:py-2 bg-neutral-800 text-white rounded opacity-50 text-sm">
                <span class="hidden sm:inline">Loading...</span>
                <span class="sm:hidden">...</span>
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

// Jobs store for system status
const jobsStore = useJobsStore()

// System status helper functions
const getSystemHealthIcon = (health: string) => {
  switch (health) {
    case 'healthy': return 'i-heroicons-check-circle'
    case 'degraded': return 'i-heroicons-exclamation-triangle'
    case 'unhealthy': return 'i-heroicons-x-circle'
    default: return 'i-heroicons-question-mark-circle'
  }
}

const getSystemHealthColor = (health: string) => {
  switch (health) {
    case 'healthy': return 'text-green-600 dark:text-green-400'
    case 'degraded': return 'text-yellow-600 dark:text-yellow-400'
    case 'unhealthy': return 'text-red-600 dark:text-red-400'
    default: return 'text-gray-600 dark:text-gray-400'
  }
}

const getWorkerStatusIcon = (status: string) => {
  switch (status) {
    case 'healthy': return 'i-heroicons-check-circle'
    case 'unhealthy': return 'i-heroicons-x-circle'
    default: return 'i-heroicons-question-mark-circle'
  }
}

const getWorkerStatusColor = (status: string) => {
  switch (status) {
    case 'healthy': return 'text-green-600 dark:text-green-400'
    case 'unhealthy': return 'text-red-600 dark:text-red-400'
    default: return 'text-gray-600 dark:text-gray-400'
  }
}

const getProcessingStatusIcon = (status: string) => {
  switch (status) {
    case 'idle': return 'i-heroicons-pause-circle'
    case 'processing': return 'i-heroicons-play-circle'
    case 'queued': return 'i-heroicons-clock'
    default: return 'i-heroicons-question-mark-circle'
  }
}

const getProcessingStatusColor = (status: string) => {
  switch (status) {
    case 'idle': return 'text-gray-600 dark:text-gray-400'
    case 'processing': return 'text-blue-600 dark:text-blue-400'
    case 'queued': return 'text-yellow-600 dark:text-yellow-400'
    default: return 'text-gray-600 dark:text-gray-400'
  }
}

// Navigation items
const navigationItems = ref<NavigationMenuItem[]>([
  {
    label: 'Media',
    icon: 'i-heroicons-folder',
    children: [
      {
        label: 'Media Gallery',
        icon: 'i-heroicons-squares-2x2',
        to: '/media-gallery'
      },
      {
        label: 'Subjects Gallery',
        icon: 'i-heroicons-user-group',
        to: '/subjects-gallery'
      }
    ]
  },
  {
    label: 'Jobs',
    icon: 'i-heroicons-cog-6-tooth',
    children: [
      {
        label: 'Job Queue',
        icon: 'i-heroicons-queue-list',
        to: '/jobs'
      }
    ]
  },
  {
    label: 'Utils',
    icon: 'i-heroicons-wrench-screwdriver',
    children: [
      {
        label: 'Utilities',
        icon: 'i-heroicons-cog-6-tooth',
        to: '/utilities'
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