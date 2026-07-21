import { scoreConceptImages, assessConceptDataset } from '~/server/services/loraTrainingService'

// Scored dest images carrying ALL given WD14 tags, for the concept-training
// picker, plus a dataset-readiness assessment (grade + preselect) so a bad
// dataset is caught before wasting a training run. Real only (ai_generated=false);
// composite sharpness×resolution sort. Pass `tags` comma-separated (images must
// have every tag) and an optional `goal` (default 40).
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const raw = (q.tags ?? q.tag ?? '') as string
  const tags = String(raw).split(',').map(t => t.trim()).filter(Boolean)
  if (tags.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'at least one tag is required (?tags=pov,anal)' })
  }
  const goal = Number.parseInt(String(q.goal ?? '40'), 10) || 40
  const images = await scoreConceptImages(tags)
  const assessment = assessConceptDataset(images, goal, tags.join(' + '))
  return { images, assessment }
})
