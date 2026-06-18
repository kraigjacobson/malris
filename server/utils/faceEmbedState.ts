/**
 * In-memory progress for the face-embedding background job. Mirrors the dedup
 * hashing state — reset at process start; the /api/media/faces/status endpoint
 * reads it alongside live DB coverage counts.
 */
export interface FaceEmbedProgress {
  running: boolean
  processed: number
  total: number
  errors: number
  noFace: number // images processed but with no detectable face (embedding left NULL)
  startedAt: number | null
  finishedAt: number | null
  message: string
  errorSamples: { uuid: string; error: string }[]
}

function freshProgress(): FaceEmbedProgress {
  return {
    running: false,
    processed: 0,
    total: 0,
    errors: 0,
    noFace: 0,
    startedAt: null,
    finishedAt: null,
    message: '',
    errorSamples: [],
  }
}

export const faceEmbedState = {
  embedding: freshProgress(),
}
