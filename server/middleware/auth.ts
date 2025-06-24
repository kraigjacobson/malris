export default defineEventHandler(async (event) => {
  // Skip auth for all API routes for now - can setup auth later
  if (event.node.req.url?.startsWith('/api/')) {
    console.log('Skipping auth for all API routes:', event.node.req.url)
    return
  }
  
  // No authentication required for now
  console.log('No auth required for:', event.node.req.url)
})