// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: false },
  ssr: false,
  
  // SPA loading template configuration
  spaLoadingTemplate: './app.html',
  
  // Dev server configuration for security
  devServer: {
    host: process.env.NUXT_HOST || '0.0.0.0',
    port: parseInt(process.env.NUXT_PORT || '3000')
  },
  
  // Nitro configuration for production
  nitro: {
    experimental: {
      wasm: true,
      openAPI: true,
      websocket: true
    },
    logLevel: 4, // Enable verbose logging
    timing: true // Enable request timing
    // Removed devProxy - API routes should be handled by the same Nuxt server
  },
  modules: ['@nuxt/icon', '@nuxt/eslint', '@nuxt/ui', '@nuxtjs/supabase', '@nuxt/image', '@pinia/nuxt', '@nuxtjs/device', '@scalar/nuxt'],

  css: ['~/assets/css/main.css'],

  supabase: {
    redirect: false,
    url: process.env.NUXT_PUBLIC_SUPABASE_URL,
    key: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
    useSsrCookies: true, // Enable cookies for session management
    cookiePrefix: `sb-${process.env.NUXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NUXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0] : 'malris'}-auth-token`,
    cookieOptions: {
      maxAge: 60 * 15, // 15 minutes
      sameSite: 'lax',
      secure: false, // Set to true in production with HTTPS
      httpOnly: false // Allow client-side access for dynamic expiration
    }
  },

  runtimeConfig: {
    supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
    public: {
      // Remove external API dependency - using Nuxt backend exclusively
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY
    }
  },
})