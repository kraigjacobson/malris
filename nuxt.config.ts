// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'
// Register global error handlers BEFORE Nuxt starts
process.on('unhandledRejection', (reason: any) => {
  const isSilentError = reason?.code === 'ECONNRESET' || reason?.code === 'EPIPE' || reason?.message?.includes('ECONNRESET') || reason?.message?.includes('EPIPE')

  if (!isSilentError) {
    console.error('[unhandledRejection]', reason)
  }
  // Silently ignore ECONNRESET errors from WebSocket disconnections
})

console.log('🛡️ [NUXT CONFIG] Global error handlers registered')

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
    timing: true, // Enable request timing
    // Removed devProxy - API routes should be handled by the same Nuxt server
    hooks: {
      close: () => {
        console.log('🔌 Nitro shutting down...')
      }
    }
  },
  modules: ['@nuxt/icon', '@nuxt/eslint', '@nuxt/ui', '@nuxtjs/supabase', '@nuxt/image', '@pinia/nuxt', '@nuxtjs/device', '@scalar/nuxt'], // '@vite-pwa/nuxt' disabled to debug reload

  css: ['~/assets/css/main.css'],

  supabase: {
    redirect: false,
    redirectOptions: {
      login: '/login',
      callback: '/',
      exclude: ['/*'], // Don't auto-redirect on any route
      cookieRedirect: false // Prevent cookie-based redirects
    },
    url: process.env.NUXT_PUBLIC_SUPABASE_URL,
    key: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY,
    useSsrCookies: false, // Disable cookies to prevent potential reloads during token refresh
    cookiePrefix: `sb-${process.env.NUXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NUXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0] : 'malris'}-auth-token`,
    cookieOptions: {
      maxAge: 60 * 15, // 15 minutes
      sameSite: 'lax',
      secure: false, // Set to true in production with HTTPS
      httpOnly: false // Allow client-side access for dynamic expiration
    },
    clientOptions: {
      auth: {
        detectSessionInUrl: false, // Don't trigger reloads when detecting session in URL
        flowType: 'implicit', // Use implicit flow to avoid redirects
        autoRefreshToken: false, // Disable auto refresh to prevent reloads on window focus
        persistSession: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined
      }
    }
  },

  // PWA Configuration for maintaining socket connections
  pwa: {
    strategies: 'generateSW',
    registerType: 'prompt',
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
      disableDevLogs: true,
      // Disable precaching entirely - app requires network anyway
      globPatterns: [],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/api\/ws\//],
      runtimeCaching: [
        {
          urlPattern: /.*/,
          handler: 'NetworkOnly'
        }
      ]
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
  }
})
