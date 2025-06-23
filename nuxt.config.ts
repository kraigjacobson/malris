// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/icon',
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/supabase',
    '@nuxt/content',
    '@nuxt/image',
    '@pinia/nuxt'
  ],

  css: ['~/assets/css/main.css'],

  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/login',
      exclude: ['/', '/api/media/**', '/api/stream/**']
    }
  },

  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_BASE,
      apiBasePath: process.env.NUXT_PUBLIC_API_BASE
    }
  },
})