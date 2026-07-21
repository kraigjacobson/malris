import { countConceptImages } from '~/server/services/loraTrainingService'

// Live match count for the concept picker: how many real dest images carry ALL
// the given tags (?tags=pov,anal). Cheap COUNT — no image payload — so the modal
// can show it as tags are selected, before hitting Search.
export default defineEventHandler(async (event) => {
  const raw = (getQuery(event).tags ?? '') as string
  const tags = String(raw).split(',').map(t => t.trim()).filter(Boolean)
  if (tags.length === 0) return { count: 0 }
  return { count: await countConceptImages(tags) }
})
