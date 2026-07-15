import { scoreSubjectImages } from '~/server/services/loraTrainingService'

// Scored + diversity-ordered source images for the training-image picker.
// The client preselects the first N (default ~30): the greedy max-min ordering
// over face embeddings means those N are the most varied usable images.
export default defineEventHandler(async (event) => {
  const subjectUuid = getQuery(event).subject_uuid as string | undefined
  if (!subjectUuid) {
    throw createError({ statusCode: 400, statusMessage: 'subject_uuid is required' })
  }
  const images = await scoreSubjectImages(subjectUuid)
  return { images }
})
