<template>
  <div class="container mx-auto p-6">
    <div class="max-w-md mx-auto">
      
      <!-- Show user info if logged in -->
      <div v-if="user" class="bg-green-50 p-6 rounded-lg border border-green-200 mb-6">
        <p class="text-green-800 text-center mb-4">
          Welcome back, {{ user.email }}!
        </p>
        <div class="space-y-3">
          <NuxtLink
            to="/"
            class="block w-full text-center px-4 py-2 bg-neutral-800 text-white rounded hover:bg-neutral-700 transition-colors"
          >
            Go to Dashboard
          </NuxtLink>
          <button
            class="block w-full px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            @click="handleSignOut"
          >
            Sign Out
          </button>
        </div>
      </div>
      
      <!-- Login form if not logged in -->
      <div v-else class="bg-neutral-50 p-6 rounded-lg border border-neutral-200">
        <form class="space-y-4" @submit.prevent="handleEmailLogin">
          <div>
            <label class="block text-sm font-medium text-neutral-700 mb-2">Email</label>
            <input
              v-model="email"
              type="email"
              required
              placeholder="Enter your email"
              class="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500"
            >
          </div>
          <div>
            <label class="block text-sm font-medium text-neutral-700 mb-2">Password</label>
            <input
              v-model="password"
              type="password"
              required
              placeholder="Enter your password"
              class="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-500"
            >
          </div>
          
          <div v-if="error" class="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {{ error }}
          </div>
          
          <div class="space-y-3">
            <button
              type="submit"
              :disabled="loading"
              class="w-full px-4 py-2 bg-neutral-800 text-white rounded hover:bg-neutral-700 transition-colors disabled:opacity-50"
            >
              {{ loading ? 'Signing In...' : 'Sign In' }}
            </button>
          </div>
        </form>
      </div>
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
      await navigateTo('/')
    }
  } catch {
    error.value = 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}

// Handle sign out
const handleSignOut = async () => {
  await supabase.auth.signOut()
  await navigateTo('/login')
}

// Redirect if already logged in
watchEffect(() => {
  if (user.value && import.meta.client) {
    navigateTo('/')
  }
})

useHead({
  title: 'Login - AI Job Tracking System'
})
</script>