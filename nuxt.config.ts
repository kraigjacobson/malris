// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: false },
  ssr: false,
  
  // Dev server configuration for security
  devServer: {
    host: '0.0.0.0',
    port: 3000
  },
  
  // Nitro configuration for production
  nitro: {
    experimental: {
      wasm: true
    }
  },
  modules: [
    '@nuxt/icon',
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/supabase',
    '@nuxt/image',
    '@pinia/nuxt'
  ],

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
      apiUrl: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000',
      apiBasePath: process.env.NUXT_PUBLIC_API_BASE,
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY
    }
  },
})