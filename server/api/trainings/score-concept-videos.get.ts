import { scoreConceptVideos } from '~/server/services/loraTrainingService'

// Scored dest VIDEOS carrying ALL given tags, for the concept Videos tab. Real
// only; composite-sorted; includes clip duration. ?tags=pov,anal
export default defineEventHandler(async (event) => {
  const raw = (getQuery(event).tags ?? '') as string
  const tags = String(raw).split(',').map(t => t.trim()).filter(Boolean)
  if (tags.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'at least one tag is required (?tags=pov,anal)' })
  }
  const videos = await scoreConceptVideos(tags)
  return { videos }
})
