<template>
  <UApp>
    <div class="min-h-screen bg-neutral-300 dark:bg-neutral-900">
      <NuxtRouteAnnouncer />
      <AppHeader v-if="user" />
      <main>
        <NuxtPage />
      </main>
      <ConfirmDialog />
    </div>
  </UApp>
</template>

<script setup>
import { useSubjectsStore } from '~/stores/subjects'

const user = useSupabaseUser()
const subjectsStore = useSubjectsStore()

// Initialize subjects cache when app loads (only when user is authenticated)
watch(user, async (newUser) => {
  if (newUser) {
    try {
      console.log('🚀 Initializing subjects cache...')
      await subjectsStore.initializeFullSubjects()
      console.log('✅ Subjects cache initialized')
    } catch (error) {
      console.error('❌ Failed to initialize subjects cache:', error)
    }
  }
}, { immediate: true })
</script>
