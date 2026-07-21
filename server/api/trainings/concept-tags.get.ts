import { getDb } from '~/server/utils/database'
import { sql } from 'drizzle-orm'

/**
 * Tag autocomplete for the concept-training picker: distinct WD14 tags that
 * actually occur on REAL dest images (ai_generated=false), with a count each, so
 * the modal can suggest specific tags instead of the user guessing. Matches the
 * same filter the image picker uses, so counts are truthful.
 *
 * Query:
 *   q       optional prefix filter (ILIKE 'q%'); empty = the most common tags.
 *   exclude optional comma-separated tags already selected (hidden from results).
 */
export default defineEventHandler(async event => {
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  const exclude = String(query.exclude ?? '')
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
  const db = getDb()

  // Escape LIKE wildcards in the user prefix so they're literal.
  const prefix = q.replace(/[\\%_]/g, '\\$&') + '%'
  const rows: any = await db.execute(sql`
    SELECT tag, count(*)::int AS n
    FROM media_records m,
         LATERAL jsonb_array_elements_text(m.tags -> 'tags') AS tag
    WHERE m.purpose = 'dest'
      AND m.type = 'image'
      AND m.ai_generated = false
      ${q ? sql`AND tag ILIKE ${prefix}` : sql``}
    GROUP BY tag
    ORDER BY n DESC, tag ASC
    LIMIT 40
  `)
  const list = ((rows?.rows ?? rows) as { tag: string; n: number }[]) || []
  const filtered = exclude.length
    ? list.filter(r => !exclude.includes(String(r.tag).toLowerCase()))
    : list
  return { tags: filtered.slice(0, 30) }
})
