#!/usr/bin/env node

/**
 * Backfill width/height on media_records for images that don't have them.
 *
 * For each image row where width or height is NULL, this script:
 *   1. Hits the running Nuxt server's /api/media/{uuid}/image?dims_only=true
 *      (which decrypts the bytes server-side, runs sharp().metadata(), and
 *      returns just { width, height } as JSON — no pixel transfer).
 *   2. UPDATEs the row with the returned dimensions.
 *
 * Requires the dev/prod Nuxt server to be reachable at API_URL.
 *
 * Usage (from inside the malris container):
 *   node scripts/backfill-image-dims.js                     # all missing, prod defaults
 *   node scripts/backfill-image-dims.js --limit 100         # first 100
 *   node scripts/backfill-image-dims.js --dry-run           # no UPDATE
 *   node scripts/backfill-image-dims.js --concurrency 8     # parallel workers
 *   API_URL=http://localhost:3003 node scripts/backfill-image-dims.js
 */

import { Pool } from 'pg'

const args = process.argv.slice(2)
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}
const hasFlag = (flag) => args.includes(flag)

const LIMIT = parseInt(getArg('--limit', '0')) || 0
const CONCURRENCY = parseInt(getArg('--concurrency', '4')) || 4
const DRY_RUN = hasFlag('--dry-run')
const API_URL = process.env.API_URL || 'http://localhost:3003'

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'comfy_media',
  user: process.env.DB_USER || 'comfy_user',
  password: process.env.DB_PASSWORD || 'comfy_secure_password_2024'
})

const fetchDims = async (uuid) => {
  const res = await fetch(`${API_URL}/api/media/${uuid}/image?dims_only=true`)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`)
  }
  const body = await res.json()
  if (!body || typeof body.width !== 'number' || typeof body.height !== 'number') {
    throw new Error(`bad response: ${JSON.stringify(body)}`)
  }
  return body
}

const updateRow = async (uuid, width, height) => {
  await pool.query(
    'UPDATE media_records SET width = $1, height = $2, updated_at = NOW() WHERE uuid = $3',
    [width, height, uuid]
  )
}

const worker = async (queue, stats) => {
  while (queue.length > 0) {
    const row = queue.shift()
    if (!row) break
    try {
      const { width, height } = await fetchDims(row.uuid)
      if (!DRY_RUN) await updateRow(row.uuid, width, height)
      stats.ok++
      stats.done++
      if (stats.done % 50 === 0) {
        console.log(`  ${stats.done}/${stats.total} (ok=${stats.ok}, fail=${stats.fail})`)
      }
    } catch (err) {
      stats.fail++
      stats.done++
      stats.errors.push(`${row.uuid}: ${err.message}`)
    }
  }
}

const main = async () => {
  console.log(`🔍 API_URL=${API_URL}  concurrency=${CONCURRENCY}  dry=${DRY_RUN}  limit=${LIMIT || 'all'}`)
  // Quick reachability probe so we don't hammer the DB before finding out the
  // API is down. Not critical — a failed uuid will report its own error.
  try {
    const probe = await fetch(`${API_URL}/api/media/health`)
    console.log(`  API health: ${probe.status}`)
  } catch (err) {
    console.warn(`  API probe failed (continuing anyway): ${err.message}`)
  }

  const { rows } = await pool.query(
    `SELECT uuid FROM media_records
     WHERE type = 'image'
       AND (width IS NULL OR height IS NULL)
     ORDER BY created_at DESC
     ${LIMIT ? `LIMIT ${LIMIT}` : ''}`
  )
  console.log(`📋 ${rows.length} image rows missing width/height`)
  if (rows.length === 0) {
    await pool.end()
    return
  }

  const stats = { total: rows.length, done: 0, ok: 0, fail: 0, errors: [] }
  const queue = [...rows]
  const start = Date.now()
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue, stats)))
  const secs = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`\n✅ Done in ${secs}s: ${stats.ok} updated, ${stats.fail} failed`)
  if (stats.errors.length > 0) {
    console.log(`\nFirst 20 errors:`)
    stats.errors.slice(0, 20).forEach(e => console.log(`  - ${e}`))
  }
  await pool.end()
}

main().catch(err => {
  console.error('Fatal:', err)
  pool.end().finally(() => process.exit(1))
})
