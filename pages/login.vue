<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
    <div class="w-full max-w-lg">
      <UCard class="shadow-lg">
        <div class="p-8">
          <UForm :state="state" class="space-y-4" @submit="handleSubmit">
            <UFormField label="Email" name="email" required>
              <UInput
                v-model="state.email"
                type="email"
                name="email"
                autocomplete="email"
                placeholder="Enter your email"
                icon="i-heroicons-envelope"
                :disabled="loading"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Password" name="password" required>
              <UInput
                v-model="state.password"
                type="password"
                name="password"
                autocomplete="off"
                placeholder="Enter your password"
                icon="i-heroicons-key"
                :disabled="loading"
                class="w-full"
              />
            </UFormField>

            <UButton
              type="submit"
              :loading="loading"
              :disabled="!isValid || loading"
              block
            >
              {{ isSignUp ? 'Sign Up' : 'Sign In' }}
            </UButton>
          </UForm>

          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            :title="error"
            class="mt-4"
          />

          <div v-if="signupSuccess" class="text-center mt-4">
            <UAlert
              color="green"
              variant="soft"
              icon="i-heroicons-check-circle"
              title="Account created successfully!"
            >
              Please check your email to verify your account before signing in.
            </UAlert>
          </div>

          <div class="text-center text-sm mt-4">
            <button
              type="button"
              class="text-primary-600 hover:text-primary-500"
              @click="toggleMode"
            >
              {{ isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up' }}
            </button>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup>
const supabase = useSupabaseClient()
const user = useSupabaseUser()

// Form state
const state = reactive({
  email: '',
  password: ''
})

const loading = ref(false)
const error = ref('')
const isSignUp = ref(false)
const signupSuccess = ref(false)

// Computed properties
const isValid = computed(() => {
  return state.email.length > 0 && state.password.length > 0
})

// Handle form submission
const handleSubmit = async () => {
  loading.value = true
  error.value = ''
  signupSuccess.value = false
  
  try {
    if (isSignUp.value) {
      // Sign up
      const { error: authError } = await supabase.auth.signUp({
        email: state.email,
        password: state.password,
      })
      
      if (authError) {
        error.value = authError.message
      } else {
        signupSuccess.value = true
        state.email = ''
        state.password = ''
      }
    } else {
      // Sign in
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: state.email,
        password: state.password,
      })
      
      if (authError) {
        error.value = authError.message
      } else {
        await navigateTo('/jobs')
      }
    }
  } catch {
    error.value = 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}

// Toggle between sign in and sign up
const toggleMode = () => {
  isSignUp.value = !isSignUp.value
  error.value = ''
  signupSuccess.value = false
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