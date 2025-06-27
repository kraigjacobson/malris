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
const user = useSupabaseUser()
</script>
