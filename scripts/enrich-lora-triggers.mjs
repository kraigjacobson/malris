#!/usr/bin/env node
/**
 * Resolve every LoRA under LORAS_DIR/<subdir> against Civitai by file SHA256 and
 * populate authoritative trigger words + model name/URL into lora_metadata.
 *
 * Civitai has no AIR tag embedded in these files, but its by-hash endpoint
 * (GET /api/v1/model-versions/by-hash/<sha256>) returns the version's
 * trainedWords, which are the real trigger words. This overwrites trigger_words
 * for any LoRA that resolves; unresolved files are left untouched and reported.
 *
 *   node scripts/enrich-lora-triggers.mjs            # t2v/ subdir (default)
 *   node scripts/enrich-lora-triggers.mjs --dry-run  # look up + report, no writes
 *   node scripts/enrich-lora-triggers.mjs --subdir=  # LoRA root (empty subdir)
 */
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { execFileSync } from 'child_process'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry-run')
const subdirArg = process.argv.find(a => a.startsWith('--subdir='))
const SUBDIR = subdirArg ? subdirArg.slice('--subdir='.length) : 't2v'

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!(m[1] in process.env)) process.env[m[1]] = v
    }
  } catch { /* .env optional */ }
}
loadEnv()

const LORAS_DIR = process.env.LORAS_DIR || '/var/mnt/hdd/models/loras'
const scanDir = SUBDIR ? join(LORAS_DIR, SUBDIR) : LORAS_DIR
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function sha256(path) {
  return execFileSync('sha256sum', [path], { encoding: 'utf8' }).split(' ')[0]
}

function civitaiByHash(hash) {
  // curl (works cleanly through the local egress firewall); returns null on miss.
  let out
  try {
    out = execFileSync('curl', ['-s', '--max-time', '25', `https://civitai.com/api/v1/model-versions/by-hash/${hash}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  } catch { return null }
  if (!out) return null
  let j
  try { j = JSON.parse(out) } catch { return null }
  if (!j || j.error || j.message || !j.id) return null
  return j
}

// Recursively list *.safetensors under dir, returning POSIX paths relative to it
// (e.g. "char/Foo.safetensors") so subfolders like char/ are covered.
function listLoras(dir, prefix = '') {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...listLoras(join(dir, e.name), prefix ? `${prefix}/${e.name}` : e.name))
    else if (e.isFile() && e.name.endsWith('.safetensors')) out.push(prefix ? `${prefix}/${e.name}` : e.name)
  }
  return out
}

async function main() {
  const files = listLoras(scanDir).sort()
  console.log(`${DRY ? '[DRY RUN] ' : ''}Enriching ${files.length} LoRAs in ${scanDir} via Civitai by-hash...\n`)

  const pool = DRY ? null : new pg.Pool({
    host: process.env.DB_HOST === 'localhost' ? '127.0.0.1' : (process.env.DB_HOST || '127.0.0.1'),
    port: parseInt(process.env.DB_PORT || '3432'),
    database: process.env.DB_NAME || 'comfy_media',
    user: process.env.DB_USER || 'comfy_user',
    password: process.env.DB_PASSWORD || 'comfy_secure_password_2024',
    connectionTimeoutMillis: 5000,
  })

  let resolved = 0, missed = 0
  const misses = []
  try {
    for (const file of files) {
      const name = SUBDIR ? `${SUBDIR}/${file}` : file
      const hash = sha256(join(scanDir, file))
      const v = civitaiByHash(hash)
      if (!v) { missed++; misses.push(file); console.log(`  ✗ ${file}  (no Civitai match)`); await sleep(250); continue }

      const words = Array.isArray(v.trainedWords) ? v.trainedWords.filter(Boolean) : []
      const trigger = words.join(', ') || null
      const modelName = v.model?.name || null
      const url = v.modelId ? `https://civitai.com/models/${v.modelId}?modelVersionId=${v.id}` : null
      resolved++
      console.log(`  ✓ ${file}\n      model: ${modelName}\n      trigger: ${trigger ? trigger.slice(0, 120) : '(none listed)'}`)

      if (!DRY) {
        await pool.query(
          `INSERT INTO lora_metadata (name, trigger_words, civitai_name, civitai_url, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (name) DO UPDATE
             SET trigger_words = COALESCE(EXCLUDED.trigger_words, lora_metadata.trigger_words),
                 civitai_name = EXCLUDED.civitai_name,
                 civitai_url = EXCLUDED.civitai_url,
                 updated_at = NOW()`,
          [name, trigger, modelName, url]
        )
      }
      await sleep(300) // be polite to the API
    }
    console.log(`\n${DRY ? '[DRY RUN] ' : ''}Done. Resolved ${resolved}/${files.length}. Unresolved: ${missed}${misses.length ? ' (' + misses.join(', ') + ')' : ''}`)
  } finally {
    if (pool) await pool.end()
  }
}

main().catch(e => { console.error('❌ Enrich failed:', e.message); process.exit(1) })
