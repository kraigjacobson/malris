<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-lg">
      
      <!-- Show user info if logged in -->
      <UCard v-if="user" class="p-6">
        <p class="text-center mb-4">{{ user.email }}</p>
        <div class="space-y-3">
          <UButton
            to="/jobs"
            block
            size="lg"
          >
            Job Queue
          </UButton>
          <UButton
            block
            size="lg"
            variant="outline"
            @click="handleSignOut"
          >
            Sign Out
          </UButton>
        </div>
      </UCard>
      
      <!-- Login form if not logged in -->
      <UCard v-else class="p-6">
        <form @submit.prevent="handleEmailLogin" class="space-y-4">
          <UFormField label="Email" name="email">
            <UInput
              v-model="email"
              type="email"
              required
              placeholder="Enter your email"
              autocomplete="email"
            />
          </UFormField>

          <UFormField label="Password" name="password">
            <UInput
              v-model="password"
              type="password"
              required
              placeholder="Enter your password"
              autocomplete="new-password"
            />
          </UFormField>
          
          <UAlert
            v-if="error"
            color="red"
            variant="soft"
            :description="error"
          />
          
          <UButton
            type="submit"
            :loading="loading"
            block
            color="green"
          >
            {{ loading ? 'Signing In...' : 'Login' }}
          </UButton>
        </form>
      </UCard>
    </div>
  </div>
</template>

<script setup>
const supabase = useSupabaseClient()
const user = useSupabaseUser()

// Form data
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

// Handle email/password login
const handleEmailLogin = async () => {
  loading.value = true
  error.value = ''
  
  try {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })
    
    if (authError) {
      error.value = authError.message
    } else {
      // Record login time for the auth middleware
      if (import.meta.client) {
        try {
          const localforage = await import('localforage')
          await localforage.default.setItem('lastLoginTime', Date.now())
        } catch (error) {
          console.error('Error setting login time:', error)
        }
      }
      await navigateTo('/jobs')
    }
  } catch {
    error.value = 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}

// Handle sign out
const handleSignOut = async () => {
  // Clear login time when signing out
  if (import.meta.client) {
    try {
      const localforage = await import('localforage')
      await localforage.default.removeItem('lastLoginTime')
    } catch (error) {
      console.error('Error clearing login time:', error)
    }
  }
  await supabase.auth.signOut()
  await navigateTo('/login')
}

// Redirect if already logged in
watchEffect(() => {
  if (user.value && import.meta.client) {
    navigateTo('/jobs')
  }
})

useHead({
  title: 'Login - AI Job Tracking System'
})
</script>