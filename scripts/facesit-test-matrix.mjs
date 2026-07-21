// One-off: queue a small facesitting test matrix (char + facesitting, +/- PussyLoRA
// helper, varying strengths) at low-res, and push them to the FRONT of the queue
// so they render first. Prompt is composed from the CURRENT facesitting template.
import pg from '/var/mnt/ssd/repos/dop/malris/node_modules/pg/lib/index.js'
import { readFileSync } from 'fs'

const env = {}
for (const l of readFileSync('/var/mnt/ssd/repos/dop/malris/.env', 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l)
  if (m) { let v = m[2].trim(); if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1); env[m[1]] = v }
}
const pool = new pg.Pool({ host: '127.0.0.1', port: parseInt(env.DB_PORT || '3432'), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD })

const CHAR_HI = 't2v/char/cam_wan22_high.safetensors', CHAR_LO = 't2v/char/cam_wan22_low.safetensors'
const FS_HI = 't2v/T2V-WAN2.2-HighNoise_POVFaceSitting-000016.safetensors', FS_LO = 't2v/T2V-WAN2.2-LowNoise_POVFaceSitting-000026.safetensors'
const PUSSY_HI = 't2v/PussyLoRA_wan2.2high_epoch80.safetensors', PUSSY_LO = 't2v/PussyLoRA_wan2.2low_epoch80.safetensors'
const DEFAULT_BODY = ' with a big round ass and small, natural breasts'

const one = async (name) => (await pool.query('SELECT prompt_template, negative_prompt, trigger_words FROM lora_metadata WHERE name=$1', [name])).rows[0]
const fs = await one(FS_HI)
const chr = await one(CHAR_HI)

const fillSlot = (t, slot, v) => t.split(`[${slot}]`).join(v)
function composeChar(template, identity) {
  let out = template
  out = fillSlot(out, 'subject', ''); out = fillSlot(out, 'body', '')
  const m = out.match(/a beautiful (giant )?naked woman('s)?/)
  if (m) { const giant = m[1] ? 'giant ' : ''; out = out.replace(m[0], m[2] ? `her ${giant}nude` : `her, ${giant}nude${DEFAULT_BODY},`) }
  out = `${identity.trim().replace(/\s+/g, ' ').replace(/[,.\s]+$/, '')}. ${out}`
  return fillSlot(fillSlot(fillSlot(out, 'expression', ''), 'accessory', ''), 'effect', '')
}
const prompt = composeChar(fs.prompt_template, chr.trigger_words)
const negative = fs.negative_prompt

const MATRIX = [
  { fs: 0.7 }, { fs: 0.8 }, { fs: 0.9 },
  { fs: 0.8, pussy: 0.5 }, { fs: 0.8, pussy: 0.7 },
]

const created = []
for (const v of MATRIX) {
  const params = {
    _test_label: `fs${v.fs}${v.pussy ? `+pussy${v.pussy}` : ''}`,
    prompt, negative_prompt: negative, length: 81, width: 480, height: 832,
    lora_1_high: CHAR_HI, lora_1_low: CHAR_LO, lora_1_high_strength: 1, lora_1_low_strength: 1,
    lora_2_high: FS_HI, lora_2_low: FS_LO, lora_2_high_strength: v.fs, lora_2_low_strength: v.fs,
  }
  if (v.pussy) {
    Object.assign(params, {
      lora_3_high: PUSSY_HI, lora_3_low: PUSSY_LO, lora_3_high_strength: v.pussy, lora_3_low_strength: v.pussy,
    })
  }
  const res = await fetch('http://127.0.0.1:3003/api/jobs/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_type: 't2v', parameters: params }),
  })
  const j = await res.json().catch(() => ({}))
  const id = j.job_id || j.id || j.data?.id
  if (id) { created.push(id); console.log(`queued ${params._test_label} -> ${id}`) }
  else console.log(`FAILED ${params._test_label}:`, JSON.stringify(j).slice(0, 200))
}

if (created.length) {
  const pr = await fetch('http://127.0.0.1:3003/api/jobs/processing/prioritize', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_ids: created }),
  })
  console.log('prioritized:', JSON.stringify(await pr.json().catch(() => ({}))).slice(0, 160))
}
console.log(`\nComposed prompt:\n${prompt.slice(0, 400)}...`)
await pool.end()
