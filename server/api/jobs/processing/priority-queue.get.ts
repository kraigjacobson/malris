/**
 * GET /api/jobs/processing/priority-queue
 *
 * Returns the current in-memory priority queue (array of job UUIDs, in
 * pick order — index 0 is picked next). The picker prunes stale entries
 * lazily as it iterates, so the list may include ids whose jobs have
 * since moved past 'queued'; consumers should treat it as advisory.
 */
import { getPriorityQueue } from '~/server/services/jobProcessingService'

export default defineEventHandler(() => {
  const queue = getPriorityQueue()
  return {
    success: true,
    queue,
    count: queue.length
  }
})
