// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'

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
  modules: ['@nuxt/icon', '@nuxt/eslint', '@nuxt/ui', '@nuxtjs/supabase', '@nuxt/image', '@pinia/nuxt', '@nuxtjs/device', '@scalar/nuxt', '@vite-pwa/nuxt'],

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

  // PWA Configuration for maintaining socket connections
  pwa: {
    strategies: 'generateSW',
    registerType: 'autoUpdate',
    manifest: {
      name: 'Malris - Media Processing',
      short_name: 'Malris',
      description: 'AI-powered media processing application that stays connected',
      theme_color: '#1a1a1a',
      background_color: '#000000',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      categories: ['productivity', 'utilities'],
      icons: [
        {
          src: '/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
      runtimeCaching: [
        {
          urlPattern: /^https?:\/\/.*\/api\/.*$/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            networkTimeoutSeconds: 10,
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          urlPattern: /\/_nuxt\/.*/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'nuxt-cache'
          }
        }
      ],
      // Keep service worker active for socket connections
      skipWaiting: true,
      clientsClaim: true,
      cleanupOutdatedCaches: true
    },
    devOptions: {
      enabled: false, // Disable in development to avoid MIME type issues
      type: 'module'
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