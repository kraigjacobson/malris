// For authenticated requests to /api/auth/ endpoints
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

// For non-authenticated requests (like media API, content API, etc.)
export const useApiFetch = async (url: string, options: any = {}) => {
  // Auto-prepend /api/ if not already present
  const apiUrl = url.startsWith('/api/') ? url : `/api/${url}`
  
  return $fetch(apiUrl, options)
}