#!/usr/bin/env node
/**
 * Seed compositional prompt metadata into lora_metadata for the t2v LoRA library
 * under LORAS_DIR/t2v. High/low-noise pairs share one entry. Rows are keyed by
 * the LoRA's path relative to LORAS_DIR (e.g. "t2v/foo.safetensors").
 *
 * Two shapes:
 *   - position / closeup : a base `prompt_template` with labeled slots
 *       [body] [expression] [accessory] [effect]  (filled by modifier LoRAs).
 *   - body/expression/accessory/effect : a `prompt_fragment` that fills its slot.
 * Each row also gets a `category` and a recommended `default_strength`.
 *
 * Templates keep Dynamic-Prompts {a|b|c} wildcards; the app expands them at job
 * activation. Idempotent: re-running upserts these columns and leaves
 * trigger_words untouched.
 *
 *   node scripts/seed-lora-prompts.mjs           # apply
 *   node scripts/seed-lora-prompts.mjs --dry-run # print what would change
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry-run')

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

// Inline setting wildcard (positions only). Expanded at job activation.
const SETTING = '{on a large bed|on a couch|on a rug on the floor|on a bed with rumpled sheets|on a coffee table}'
const NEG = "man's face, male face visible, front view of man, her face hidden, large penis, big cock, thick penis, deformed hands, extra limbs, blurry, low detail, low quality, watermark, text"

// Base position template. `where` is the position-specific middle. Ends in the
// standard slot tail so [accessory]/[effect] land consistently.
const pos = (where, tail = `[accessory]${SETTING}. [effect]photorealistic, sharp focus.`) =>
  `${where} She appears [expression]. ${tail}`

// --- Per-concept data ----------------------------------------------------------
const DATA = {
  // ---- positions (base templates with slots) ----
  doggy: { category: 'position', strength: 1.0, template: pos(
    "POV first-person view looking down at a beautiful naked woman[body] on all fours as the viewer has doggystyle sex with her from behind, small narrow penis thrusting into her vagina. Her back and raised ass fill the frame, she looks back up over her shoulder directly at the camera with her face fully visible. The camera angles down and back so her anus and vulva are in sharp focus.") },
  analMissionary: { category: 'position', strength: 1.0, template: pos(
    "Three-quarter view of a beautiful naked woman[body] lying on her back with her legs raised and held up, a faceless man kneeling between her thighs having anal sex with her, his small narrow penis entering her anus. His head is out of frame — only his torso and arms are visible. Her face is fully visible and turned toward the camera.") },
  cowgirlPosition: { category: 'position', strength: 1.0, template: pos(
    "POV first-person view from below looking up at a beautiful naked woman[body] riding on top in cowgirl position, lowering herself onto the viewer's small narrow penis. The viewer IS the man, lying on his back — his hands rest on her hips. Her whole face and chest are fully visible above the camera.") },
  dp: { category: 'position', strength: 1.0, template: pos(
    "Three-quarter view of a beautiful naked woman[body] being double-penetrated by two faceless men, one beneath her and one behind her, both with small narrow penises, one in her vagina and one in her anus. Both men's heads are out of frame — only their torsos and hands are visible. Her face is fully visible, turned toward the camera.") },
  facefuck: { category: 'position', strength: 1.0, template: pos(
    "POV first-person view looking down at a beautiful naked woman[body] kneeling below the viewer, giving sloppy messy oral sex, the viewer's small narrow penis in her mouth, saliva and drool on her chin. She looks up over the shaft directly at the camera, her face fully visible.") },
  facials: { category: 'position', strength: 1.0, template: pos(
    "POV first-person close-up of a beautiful naked woman[body] kneeling below the viewer, her face fully visible and tilted up, receiving a facial as ropes of cum land across her cheeks, lips, and tongue. A small narrow penis is visible in the lower frame.") },
  fisting: { category: 'position', strength: 1.0, template: pos(
    "Three-quarter view of a beautiful naked woman[body] lying back with her legs spread wide, a faceless partner's hand fisting her vagina, wrist deep. The partner's head is out of frame. Her face is fully visible, turned toward the camera.") },
  handjobs: { category: 'position', strength: 1.0, template: pos(
    "POV first-person view looking down at a beautiful naked woman[body] kneeling beside the viewer, stroking the viewer's small narrow penis with her hand. She looks up at the camera, her face fully visible.") },
  matingPress: { category: 'position', strength: 1.0, template: pos(
    "POV first-person view looking down in the mating press position at a beautiful naked woman[body] on her back, her legs folded up and pinned beside her head, the viewer's small narrow penis thrusting down into her vagina. The viewer IS the man — his torso fills the top of the frame, face out of view. Her face is fully visible beneath.") },
  ps: { category: 'position', strength: 1.0, template: pos(
    "Three-quarter rear view of a beautiful naked woman[body] lying face down with her hips raised, a faceless man behind her with a small narrow penis in her vagina. His head is out of frame. Her face is turned to the side and fully visible over her shoulder.") },
  sideDoggy: { category: 'position', strength: 1.0, template: pos(
    "Side-profile view of a beautiful naked woman[body] on all fours having doggystyle sex, a faceless man behind her with a small narrow penis in her vagina, seen from the side so both her arched body and her face in profile are visible. The man's head is out of frame.") },
  sideMissionary: { category: 'position', strength: 1.0, template: pos(
    "Side-profile view of a beautiful naked woman[body] lying on her back in the missionary position, a faceless man on top with a small narrow penis in her vagina, framed from the side so her face in profile stays fully visible. The man's head is out of frame.") },
  slightSideDoggy: { category: 'position', strength: 1.0, template: pos(
    "Slight side-angle three-quarter view of a beautiful naked woman[body] on all fours having doggystyle sex from behind, a faceless man with a small narrow penis thrusting into her vagina. The angle catches both her face turned back over her shoulder and her raised rear. The man's head is out of frame.") },
  faceSitting: { category: 'position', strength: 1.0, template: pos(
    "POV first-person view looking straight up at a beautiful naked woman[body] sitting on the viewer's face, her vulva and anus lowered toward the camera, her face fully visible looking down at the viewer.") },
  tiedSitting: { category: 'position', strength: 1.0, template: pos(
    "Three-quarter view of a beautiful naked woman[body] tied with rope in a seated position, wrists and ankles bound, a faceless man with a small narrow penis penetrating her. The man's head is out of frame. Her face is fully visible, turned toward the camera.") },
  twerk: { category: 'position', strength: 1.0, template: pos(
    "Rear three-quarter view of a beautiful naked woman[body] twerking, her ass bouncing and shaking toward the camera, her anus and vulva visible beneath. She looks back over her shoulder, her face fully visible.") },
  povMissionary: { category: 'position', strength: 1.0, template: pos(
    "POV first-person view looking down at a beautiful naked woman[body] on her back in the missionary position, her legs wrapped around the viewer, the viewer's small narrow penis thrusting into her vagina. She looks up directly at the camera, her face fully visible.") },
  cowgirlV1: { category: 'position', strength: 1.0, template: pos(
    "POV first-person view from below looking up at a beautiful naked woman[body] riding the viewer in cowgirl position, bouncing on the viewer's small narrow penis, her face and body fully visible above the camera.") },
  // positions with no {SETTING} (fixed scene) — custom tail
  strappedTable: { category: 'position', strength: 1.0, template: pos(
    "Three-quarter view of a beautiful naked woman[body] strapped down to a table with restraints across her body, a faceless man standing at the table's edge with a small narrow penis in her vagina. The man's head is out of frame. Her face is fully visible, turned toward the camera.",
    "[accessory][effect]photorealistic, sharp focus.") },
  tiedSpread: { category: 'position', strength: 1.0, template: pos(
    "Overhead three-quarter view of a beautiful naked woman[body] tied spread-eagle on a bed, wrists and ankles bound to the corners, a faceless man over her with a small narrow penis in her vagina. The man's head is out of frame. Her face is fully visible.",
    "[accessory][effect]photorealistic, sharp focus.") },
  tiedStanding: { category: 'position', strength: 1.0, template: pos(
    "Three-quarter view of a beautiful naked woman[body] standing with her wrists tied above her head, a faceless man behind her with a small narrow penis penetrating her. The man's head is out of frame. Her face is fully visible, turned toward the camera.",
    "[accessory][effect]photorealistic, sharp focus.") },
  gyno: { category: 'position', strength: 1.0, template: pos(
    "Three-quarter view of a beautiful naked woman[body] lying back in a gynecological exam chair with her legs up in the stirrups, spread wide, a faceless man standing between her legs with a small narrow penis penetrating her. The man's head is out of frame. Her face is fully visible.",
    "[accessory]clinical room, [effect]photorealistic, sharp focus.") },
  scat: { category: 'position', strength: 1.0, template:
    "{POV first-person view from below looking up at|POV lying on the floor looking straight up at|Low-angle view from the ground of|POV first-person view from chest level looking up at} a beautiful [subject]naked woman[body] {squatting directly over the viewer|squatting low over the viewer's chest|squatting over the viewer's face|squatting on the floor beside the viewer|hovering in a deep open-legged squat above the camera}, {facing the viewer with her legs spread|turned away with her bare ass toward the camera and looking back over her shoulder at the viewer|facing forward with her thighs above the camera|rear-facing with her anus lowered toward the viewer}, her anus fully visible as she defecates {a thick chunky|a long firm|a soft slimy|a loose messy|a wet splattering|a smooth continuous|a runny liquid} stool. Her face is fully visible and she appears {straining with effort|calm and focused|relieved|blissful and satisfied|grunting|with eyes half-closed|gritting her teeth}. [accessory]{on a white-tiled bathroom floor|directly over the viewer|on a puppy pad on the floor|in a bathtub|on a white bed|outdoors on grass}. [effect]photorealistic, sharp focus, high detail." },
  giantess: { category: 'position', strength: 1.0, template: pos(
    "Low-angle view looking up at a beautiful giant naked woman[body] towering over a tiny city, a normal-sized faceless man dwarfed at her feet. Her enormous body fills the sky, her face fully visible looking down.",
    "[accessory][effect]photorealistic, sharp focus, dramatic scale.") },

  // ---- closeups (standalone bases; still support [accessory]/[effect]) ----
  pussy: { category: 'closeup', strength: 1.0, template:
    "Extreme close-up of a beautiful naked woman's vulva and anus, detailed and glistening, legs spread. Her face partially visible in the upper frame turned toward the camera. [accessory][effect]photorealistic, sharp focus, high detail." },
  vaginus: { category: 'closeup', strength: 1.0, template:
    "Extreme close-up of a beautiful naked woman's detailed vulva and vagina, realistic anatomy, legs spread. Her face partly visible in the upper frame turned toward the camera. [accessory][effect]photorealistic, sharp focus, high detail." },

  // ---- character LoRAs are folder-driven: anything under t2v/char/ is treated
  //      as a character (fills [subject]) with its trigger token from Civitai.
  //      No per-file seeding needed here.

  // ---- modifiers (fragments that fill a base's slot) ----
  thicc: { category: 'body', strength: 0.6, fragment: " with a thick, curvy figure — wide hips and full heavy breasts" },
  pawg: { category: 'body', strength: 0.6, fragment: " with a huge round bubble ass" },
  broken: { category: 'expression', strength: 0.7, fragment: "to be breaking down emotionally — teary-eyed, distressed and crying" },
  ahegao: { category: 'expression', strength: 0.7, fragment: "to be in an ahegao state — eyes rolled back, tongue lolling out, drooling with overwhelmed pleasure" },
  smooth: { category: 'effect', strength: 0.5, fragment: "smooth fluid slow-motion animation, natural realistic body motion, " },
  ballGag: { category: 'accessory', strength: 0.7, fragment: "wearing a red ball gag strapped in her mouth, drool running down her chin, " },
  ringGag: { category: 'accessory', strength: 0.7, fragment: "wearing an open ring gag holding her mouth wide, drooling, " },
}

// --- Filename -> concept key (keyed under t2v/) --------------------------------
const FILES = {
  '34doggy-wan22-HN-e40-az420.safetensors': 'doggy',
  '34doggy-wan22-LN-e76-az420.safetensors': 'doggy',
  'analMissionary_wan22_T2V_high_e30.safetensors': 'analMissionary',
  'analMissionary_wan22_T2V_low_e30.safetensors': 'analMissionary',
  'Cowgirl_position_high_noise.safetensors': 'cowgirlPosition',
  'Cowgirl_position_low_noise.safetensors': 'cowgirlPosition',
  'dp-wan22-HN-e50-az420.safetensors': 'dp',
  'dp-wan22-LN-e109-az420.safetensors': 'dp',
  'facefuck_sloppy_high_targetFrames_w105-000080_converted.safetensors': 'facefuck',
  'facefuck_sloppy_low-000260_converted.safetensors': 'facefuck',
  'Facials_high_noise.safetensors': 'facials',
  'Facials_low_noise.safetensors': 'facials',
  'fisting-wan22-high-noise-e80-az420.safetensors': 'fisting',
  'fisting-wan22-low-noise-e93-az420.safetensors': 'fisting',
  'Handjobs_high_noise.safetensors': 'handjobs',
  'Handjobs_low_noise.safetensors': 'handjobs',
  'mating-press-sex-wan22-HN-e50-az420.safetensors': 'matingPress',
  'mating-press-sex-wan22-LN-e70-az420.safetensors': 'matingPress',
  'ps_high_noise.safetensors': 'ps',
  'ps_low_noise.safetensors': 'ps',
  'PussyLoRA_wan2.2high_epoch80.safetensors': 'pussy',
  'PussyLoRA_wan2.2low_epoch80.safetensors': 'pussy',
  'side-doggy-wan22-hn-40.safetensors': 'sideDoggy',
  'side-doggy-wan22-ln-57.safetensors': 'sideDoggy',
  'side-missionary-wan22-high-noise-e70-az420.safetensors': 'sideMissionary',
  'side-missionary-wan22-low-noise-e36-az420.safetensors': 'sideMissionary',
  'slight-side-angle-doggy-wan22-HN-e45-az420.safetensors': 'slightSideDoggy',
  'slight-side-angle-doggy-wan22-LN-e34-az420.safetensors': 'slightSideDoggy',
  'SmoothXXXAnimation_High.safetensors': 'smooth',
  'SmoothXXXAnimation_Low.safetensors': 'smooth',
  'strapped-to-table-wan22-high-noise-e60-fcb-az420.safetensors': 'strappedTable',
  'strapped-to-table-wan22-low-noise-e39-f-az420.safetensors': 'strappedTable',
  'T2V-WAN2.2-HighNoise_POVFaceSitting-000016.safetensors': 'faceSitting',
  'T2V-WAN2.2-LowNoise_POVFaceSitting-000026.safetensors': 'faceSitting',
  'tied-sitting-wan22-HN-e60-az420.safetensors': 'tiedSitting',
  'tied-sitting-wan22-LN-e56-az420.safetensors': 'tiedSitting',
  'tied-spreadeagle-wan22-high-noise-e50-az420.safetensors': 'tiedSpread',
  'tied-spreadeagle-wan22-low-noise-e50-az420.safetensors': 'tiedSpread',
  'tied-standing-wan22-high-noise-e47-az420.safetensors': 'tiedStanding',
  'tied-standing-wan22-low-noise-e50-az420.safetensors': 'tiedStanding',
  'V3TWERKHIGH.safetensors': 'twerk',
  'V3TWERKLOW.safetensors': 'twerk',
  'Wan2-2_ball gag_V1E7.safetensors': 'ballGag',
  'Wan22_Ring Gag_V1E7.safetensors': 'ringGag',
  'Wan2.2-T2V-Femaled-Vaginus-High-v1.safetensors': 'vaginus',
  'Wan2.2-T2V-Femaled-Vaginus-Low-V1.safetensors': 'vaginus',
  'wan22_t2v_giantess_high_noise.safetensors': 'giantess',
  'wan22_t2v_giantess_low_noise.safetensors': 'giantess',
  'wan_2.2_t2v_highnoise_broken_v1.0.safetensors': 'broken',
  'wan_2.2_t2v_lownoise_broken_v1.0.safetensors': 'broken',
  'wan2.2_t2v_highnoise_cowgirl_v1.0.safetensors': 'cowgirlV1',
  'wan2.2_t2v_lownoise_cowgirl_v1.0.safetensors': 'cowgirlV1',
  'WAN2.2-T2V-HighNoise_PAWG.safetensors': 'pawg',
  'WAN2.2-T2V-LowNoise_PAWG.safetensors': 'pawg',
  'wan2.2_t2v_highnoise_pov_missionary_v1.0.safetensors': 'povMissionary',
  'wan2.2_t2v_lownoise_pov_missionary_v1.0.safetensors': 'povMissionary',
  'wan22_t2v_thicc_high_noise.safetensors': 'thicc',
  'wan22_t2v_thicc_low_noise.safetensors': 'thicc',
  'xGynoChairx_wan22_0609_000005250_high_noise.safetensors': 'gyno',
  'xGynoChairx_wan22_0609_000005250_low_noise.safetensors': 'gyno',
  'Wan2.2 - T2V - Ahegao - LOW 14B.safetensors': 'ahegao',
  'WAN2.2-T2V_HighNoise_ScatMaster-V2.safetensors': 'scat',
  'WAN2.2-T2V_LowNoise_ScatMaster-V2.safetensors': 'scat',
}

const SUBDIR = process.env.LORA_T2V_SUBDIR ?? 't2v'
const BASE_CATS = new Set(['position', 'closeup'])

// Inject the [subject] slot right before the first "naked woman" so a character
// LoRA's trigger token can set who she is (e.g. "a beautiful B3th_v1mdw naked
// woman"). Empty by default -> "a beautiful naked woman".
const injectSubject = (t) => t.includes('[subject]') ? t : t.replace('naked woman', '[subject]naked woman')

async function main() {
  const rows = Object.entries(FILES).map(([file, key]) => {
    const d = DATA[key]
    if (!d) throw new Error(`No data for key "${key}" (file ${file})`)
    const isBase = BASE_CATS.has(d.category)
    return {
      name: SUBDIR ? `${SUBDIR}/${file}` : file,
      template: isBase ? injectSubject(d.template) : null,
      negative: isBase ? NEG : null,
      category: d.category,
      fragment: isBase ? null : d.fragment,
      strength: d.strength,
      pairKey: key, // shared concept id for the high/low pair
    }
  })

  const bases = rows.filter(r => BASE_CATS.has(r.category)).length
  console.log(`${DRY ? '[DRY RUN] ' : ''}Seeding ${rows.length} rows (${new Set(Object.values(FILES)).size} concepts: ${bases} base files + ${rows.length - bases} modifier files)...`)

  if (DRY) {
    for (const r of rows) console.log(`  [${r.category}] ${r.name} str=${r.strength}\n    ${(r.template || r.fragment || '').slice(0, 100)}`)
    console.log('[DRY RUN] No changes written.')
    return
  }

  const pool = new pg.Pool({
    host: process.env.DB_HOST === 'localhost' ? '127.0.0.1' : (process.env.DB_HOST || '127.0.0.1'),
    port: parseInt(process.env.DB_PORT || '3432'),
    database: process.env.DB_NAME || 'comfy_media',
    user: process.env.DB_USER || 'comfy_user',
    password: process.env.DB_PASSWORD || 'comfy_secure_password_2024',
    connectionTimeoutMillis: 5000,
  })

  let n = 0
  try {
    for (const r of rows) {
      await pool.query(
        `INSERT INTO lora_metadata (name, prompt_template, negative_prompt, category, prompt_fragment, default_strength, pair_key, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (name) DO UPDATE
           SET prompt_template = EXCLUDED.prompt_template,
               negative_prompt = EXCLUDED.negative_prompt,
               category = EXCLUDED.category,
               prompt_fragment = EXCLUDED.prompt_fragment,
               default_strength = EXCLUDED.default_strength,
               pair_key = EXCLUDED.pair_key,
               updated_at = NOW()`,
        [r.name, r.template, r.negative, r.category, r.fragment, r.strength, r.pairKey]
      )
      n++
    }
    console.log(`✅ Seeded ${n} rows into lora_metadata (trigger_words left untouched).`)
  } finally {
    await pool.end()
  }
}

main().catch((e) => { console.error('❌ Seed failed:', e.message); process.exit(1) })
