import { isRunning } from './start.post'

export default defineEventHandler(async () => {
  return {
    running: isRunning(),
    progress: null,
    total: null,
    deleted: null,
    startTime: null,
    lastUpdate: null,
    error: null
  }
})
