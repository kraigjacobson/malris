/**
 * In-memory progress for the full-tag (WD14) background job. Mirrors
 * captionState / sharpnessState. Reset at process start;
 * /api/media/full-tag/status reads it.
 */
export interface Wd14Progress {
  running: boolean
  processed: number
  total: number
  errors: number
  startedAt: number | null
  finishedAt: number | null
  message: string
  errorSamples: { uuid: string; error: string }[]
}

function freshProgress(): Wd14Progress {
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

export const wd14State = {
  tagging: freshProgress(),
}
