/**
 * Debug logging endpoint for remote devices
 * Receives logs from clients and outputs them to server console
 */
export default defineEventHandler(async event => {
  const body = await readBody(event)

  console.log(`📱 [REMOTE LOG] ${body.message}`, body.data || '')

  return { success: true }
})
