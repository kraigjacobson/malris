export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()
  
  // Allow access to login page
  if (to.path === '/login') {
    return
  }
  
  // Redirect to login if not authenticated and on client side
  if (!user.value && import.meta.client) {
    return navigateTo('/login')
  }
})