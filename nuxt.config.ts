// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/icon',
    '@nuxt/eslint',
    '@nuxt/ui',
    // '@nuxtjs/supabase', // Temporarily disabled to bypass auth
    '@nuxt/content',
    '@nuxt/image',
    '@pinia/nuxt'
  ],

  css: ['~/assets/css/main.css'],

  // supabase: {
  //   redirectOptions: {
  //     login: '/login',
  //     callback: '/login',
  //     exclude: ['/', '/api/**', '/image-meta', '/media-gallery', '/subjects-gallery', '/submit-job', '/jobs']
  //   }
  // },

  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000',
      apiBasePath: process.env.NUXT_PUBLIC_API_BASE
    }
  },
})