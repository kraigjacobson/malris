/**
 * Global error handler for unhandled promise rejections
 * Prevents app crashes from WebSocket disconnections and other network errors
 * This runs once at server startup
 */
import { logger } from '~/server/utils/logger'

export default defineNitroPlugin(() => {
  console.log('🛡️ [ERROR HANDLER] Registering global error handlers...')

  // Handle unhandled promise rejections globally
  process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
    console.log('🔍 [ERROR HANDLER] Unhandled rejection caught:', {
      code: reason?.code,
      message: reason?.message,
      stack: reason?.stack?.split('\n').slice(0, 3).join('\n')
    })

    // Silently handle common network errors that don't need to crash the app
    const isSilentError = reason?.code === 'ECONNRESET' || reason?.code === 'EPIPE' || reason?.code === 'ECONNREFUSED' || reason?.message?.includes('ECONNRESET') || reason?.message?.includes('EPIPE')

    if (isSilentError) {
      // These are expected errors from WebSocket disconnections during file picker dialogs
      // Log them quietly without crashing the app
      console.log(`✅ [ERROR HANDLER] Network disconnection handled silently: ${reason?.code || reason?.message}`)
      logger.debug(`Network disconnection handled: ${reason?.code || reason?.message}`)
    } else {
      // Log unexpected errors
      console.log('❌ [ERROR HANDLER] Unexpected unhandled rejection:', reason)
      logger.error('Unhandled rejection:', reason)
    }
  })

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    console.log('🔍 [ERROR HANDLER] Uncaught exception caught:', {
      code: (error as any).code,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    })

    // Silently handle common network errors
    const isSilentError = (error as any).code === 'ECONNRESET' || (error as any).code === 'EPIPE' || error.message?.includes('ECONNRESET') || error.message?.includes('EPIPE')

    if (isSilentError) {
      console.log(`✅ [ERROR HANDLER] Network error handled silently: ${error.message}`)
      logger.debug(`Network error handled: ${error.message}`)
    } else {
      console.log('❌ [ERROR HANDLER] Unexpected uncaught exception:', error)
      logger.error('Uncaught exception:', error)
    }
  })

  console.log('✅ [ERROR HANDLER] Global error handlers registered successfully')
})
