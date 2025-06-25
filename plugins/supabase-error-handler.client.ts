export default defineNuxtPlugin(() => {
  // Supabase plugin temporarily disabled
  console.log('Supabase error handler plugin disabled')
  
  // Provide minimal implementation to prevent errors
  return {
    provide: {
      supabaseErrorHandler: () => ({ type: 'disabled', message: 'Supabase temporarily disabled' }),
      enhancedAuth: {
        signInWithPassword: () => Promise.resolve({ data: null, error: null }),
        signOut: () => Promise.resolve({ error: null })
      },
      checkSupabaseHealth: () => Promise.resolve(false),
      isOnline: ref(true),
      connectionRetries: ref(0)
    }
  }
})