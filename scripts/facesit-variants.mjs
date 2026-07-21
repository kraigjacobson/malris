// Queue facesitting POSE variants (approach/descend, turn-around reverse, seated
// facing + looking down) with the working char + facesitting@0.8 + PussyLoRA@0.6,
// low-res, pushed to the front. Tests how versatile the facesitting model is.
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
const BODY = 'her, nude with a big round ass and small, natural breasts,'

const chr = (await pool.query('SELECT trigger_words FROM lora_metadata WHERE name=$1', [CHAR_HI])).rows[0]
const fsNeg = (await pool.query('SELECT negative_prompt FROM lora_metadata WHERE name=$1', [FS_HI])).rows[0].negative_prompt
const id = chr.trigger_words.trim().replace(/\s+/g, ' ').replace(/[,.\s]+$/, '')
const tail = ' photorealistic, extreme detail, sharp focus, macro close-up detail on her anus and pussy.'

const VARIANTS = [
  ['descend-face-forward', `POV first-person view looking straight up as ${BODY} kneeling and straddling the viewer's head facing the viewer, then slowly lowering her hips down toward the camera — her whole naked body and face stay visible above as she descends, until she sits fully down and her wet pussy and anus fill the frame. She gazes down at the viewer, her face fully visible.`],
  ['turn-around-reverse', `POV first-person view looking straight up as ${BODY} turning around and straddling the viewer's head facing away, her big round ass and anus toward the camera, then slowly lowering down — her ass and body stay visible above as she descends until her anus fills the frame as the main focus, her wet pussy just below. She looks back over her shoulder down at the viewer, her face visible.`],
  ['seated-forward-lookdown', `POV first-person view looking straight up as ${BODY} sitting fully down on the viewer's face facing the viewer, her wet pussy and clit pressed down onto the camera, grinding slowly, looking straight down into the camera at the viewer the whole time with her face fully visible.`],
  ['descend-then-anus-grind', `POV first-person view looking straight up as ${BODY} straddling the viewer facing away and lowering her ass until her anus presses right onto the camera lens, grinding her anus and wet pussy against the viewer's face. She glances back over her shoulder at the viewer, her face visible.`],
]

const created = []
for (const [label, scene] of VARIANTS) {
  const params = {
    _test_label: `V:${label}`,
    prompt: `${id}. ${scene}${tail}`, negative_prompt: fsNeg,
    length: 81, width: 480, height: 832,
    lora_1_high: CHAR_HI, lora_1_low: CHAR_LO, lora_1_high_strength: 1, lora_1_low_strength: 1,
    lora_2_high: FS_HI, lora_2_low: FS_LO, lora_2_high_strength: 0.8, lora_2_low_strength: 0.8,
    lora_3_high: PUSSY_HI, lora_3_low: PUSSY_LO, lora_3_high_strength: 0.6, lora_3_low_strength: 0.6,
  }
  const res = await fetch('http://127.0.0.1:3003/api/jobs/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_type: 't2v', parameters: params }),
  })
  const j = await res.json().catch(() => ({}))
  const jid = j.job_id || j.id
  if (jid) { created.push(jid); console.log(`queued ${label} -> ${jid}`) }
  else console.log(`FAILED ${label}:`, JSON.stringify(j).slice(0, 200))
}
if (created.length) {
  const pr = await fetch('http://127.0.0.1:3003/api/jobs/processing/prioritize', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_ids: created }),
  })
  console.log('prioritized:', JSON.stringify(await pr.json().catch(() => ({}))).slice(0, 120))
}
await pool.end()
