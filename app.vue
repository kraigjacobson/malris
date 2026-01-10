<template>
  <UApp :toaster="toaster">
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
const toaster = { expand: false }

const user = useSupabaseUser()
const { initializeSubjects } = useSubjects()

// Initialize subjects cache when app loads (only when user is authenticated)
// This runs in the background without blocking app startup
watch(
  user,
  newUser => {
    if (newUser) {
      initializeSubjects().catch(error => {
        console.error('❌ Failed to initialize subjects cache:', error)
      })
    }
  },
  { immediate: true }
)
</script>
