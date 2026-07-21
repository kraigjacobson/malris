/**
 * In-memory progress for the sharpness-scoring background job. Mirrors
 * dedupState / faceEmbedState. Reset at process start; the
 * /api/media/sharpness/status endpoint reads it alongside live DB counts.
 */
export interface SharpnessProgress {
  running: boolean
  processed: number
  total: number
  errors: number
  startedAt: number | null
  finishedAt: number | null
  message: string
  errorSamples: { uuid: string; error: string }[]
}

function freshProgress(): SharpnessProgress {
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

export const sharpnessState = {
  scoring: freshProgress(),
}
