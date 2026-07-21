/**
 * In-memory progress for the caption background job. Mirrors sharpnessState /
 * dedupState. Reset at process start; /api/media/caption/status reads it.
 */
export interface CaptionProgress {
  running: boolean
  processed: number
  total: number
  errors: number
  startedAt: number | null
  finishedAt: number | null
  message: string
  errorSamples: { uuid: string; error: string }[]
}

function freshProgress(): CaptionProgress {
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

export const captionState = {
  captioning: freshProgress(),
}
