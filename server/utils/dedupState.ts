/**
 * In-memory progress for the dedup background jobs (hashing + pair-finding).
 * Mirrors the lightweight module-level state the tagging utility uses. Reset
 * at process start; the /api/media/dedup/status endpoint reads it alongside
 * live DB counts.
 */
export interface JobProgress {
  running: boolean
  processed: number
  total: number
  errors: number
  startedAt: number | null
  finishedAt: number | null
  message: string
  errorSamples: { uuid: string; error: string }[] // capped sample for diagnostics
}

function freshProgress(): JobProgress {
  return {
    running: false,
    processed: 0,
    total: 0,
    errors: 0,
    startedAt: null,
    finishedAt: null,
    message: '',
    errorSamples: [],
  }
}

export const dedupState = {
  hashing: freshProgress(),
  finding: freshProgress(),
  refining: freshProgress(),
}
