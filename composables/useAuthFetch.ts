export const useAuthFetch = async (url: string, options: any = {}) => {
  const supabase = useSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  const fetchOptions = { ...options }
  
  if (session?.access_token) {
    fetchOptions.headers = {
      ...fetchOptions.headers,
      'Authorization': `Bearer ${session.access_token}`
    }
  }

  // Auto-prepend /api/auth/ if not already present
  const authUrl = url.startsWith('/api/auth/') ? url : `/api/auth/${url}`
  
  return $fetch(authUrl, fetchOptions)
}

export const useAuthUseFetch = (url: string, options: any = {}) => {
  // Auto-prepend /api/auth/ if not already present
  const authUrl = url.startsWith('/api/auth/') ? url : `/api/auth/${url}`
  
  return useFetch(authUrl, {
    ...options,
    server: false, // Force client-side to ensure we have access to the session
    onRequest: async ({ options }) => {
      const supabase = useSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.access_token) {
        (options.headers as any) = {
          ...options.headers,
          'Authorization': `Bearer ${session.access_token}`
        }
      }
    }
  })
}