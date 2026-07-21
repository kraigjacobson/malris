/**
 * LoRA training support: dataset export, diffusion-pipe config generation,
 * and training-image scoring for the /training picker.
 *
 * Filesystem contract with the ktrain trainer container (both mount
 * /var/mnt/hdd/train as /train):
 *   /train/datasets/<runId>/   decrypted images + same-basename .txt captions
 *   /train/runs/<runId>/       dataset.toml, low.toml, high.toml (+ trainer output)
 *
 * Wan2.2 note: LoRAs are trained on the T2V-A14B base (diffusion-pipe requires
 * video datasets for I2V training); the ComfyUI-format outputs load onto the
 * I2V experts at inference. Config schema verified against diffusion-pipe
 * @ a7e7dec — see ktrain/configs/*.template.toml for the annotated versions.
 */

import { mkdir, writeFile, rm } from 'fs/promises'
import path from 'path'
import { eq, and, isNull, sql, count } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { bufToVec } from '~/server/utils/faceEmbedding'
import { getMediaFileData } from './mediaService'
import { trimAndCrop, type ClipCrop } from '~/server/utils/videoFrames'
import { logger } from '~/server/utils/logger'

const TRAIN_ROOT = process.env.TRAIN_DIR || '/train'

export interface TrainingConfig {
  epochs?: number
  rank?: number
  lr?: number
  resolution?: number
  num_repeats?: number
  checkpoint_minutes?: number // deepspeed resume cadence — a pause/cancel loses at most this much work
}

const CONFIG_DEFAULTS: Required<TrainingConfig> = {
  epochs: 40,
  rank: 32,
  lr: 2e-5,
  resolution: 512,
  num_repeats: 5,
  checkpoint_minutes: 30
}

// ---------------------------------------------------------------------------
// Image scoring for the picker
// ---------------------------------------------------------------------------

export interface ScoredImage {
  uuid: string
  filename: string
  width: number | null
  height: number | null
  rating: number | null
  favorite: boolean
  hasFace: boolean
  megapixels: number // (width*height)/1e6, rounded to 1 decimal
  sharpness: number | null // measured detail-at-512; NULL = not yet scored
  duration?: number | null // seconds — videos only (for the concept Videos tab)
}

// Composite training-quality sort key. Sharpness is scale-normalized (measured at
// a fixed small grid), so a razor-sharp but TINY image scores as high as a large
// one — yet a sub-512 image must be UPSCALED to reach Wan's ~512 bucket and goes
// soft at training scale. So we multiply sharpness by a resolution FLOOR factor
// that only penalizes images below the training resolution; above it, extra pixels
// don't add usable detail, so the factor caps at 1. Unscored images (sharpness
// NULL) sort behind all scored ones, ordered by raw pixel count as a fallback.
const TRAIN_MP = 0.26 // ~512x512, the Wan training bucket
function trainingQuality(s: ScoredImage): number {
  if (s.sharpness == null) return -1
  const mp = ((s.width || 0) * (s.height || 0)) / 1e6
  return s.sharpness * Math.min(1, mp / TRAIN_MP)
}
function sortByTrainingQuality(scored: ScoredImage[]): ScoredImage[] {
  const pix = (s: ScoredImage) => (s.width || 0) * (s.height || 0)
  return scored.sort((a, b) => {
    if (a.sharpness != null && b.sharpness != null) return trainingQuality(b) - trainingQuality(a)
    if (a.sharpness != null) return -1
    if (b.sharpness != null) return 1
    return pix(b) - pix(a)
  })
}

/**
 * List a subject's source images for the training picker, ordered by measured
 * SHARPNESS (real high-frequency detail at the 512 training scale, largest
 * first) — so an upscaled-blurry photo sinks even though its pixel count is
 * high. Images not yet scored (sharpness NULL) fall back to resolution order
 * behind the scored ones; run POST /api/media/sharpness/compute to backfill.
 * Diversity/expression are still curated by hand. `hasFace` is only a visual
 * hint (grayed tiles); it doesn't affect ordering.
 */
export async function scoreSubjectImages(subjectUuid: string): Promise<ScoredImage[]> {
  const db = getDb()
  const rows = await db
    .select({
      uuid: mediaRecords.uuid,
      filename: mediaRecords.filename,
      width: mediaRecords.width,
      height: mediaRecords.height,
      rating: mediaRecords.rating,
      favorite: mediaRecords.favorite,
      faceEmbedding: mediaRecords.faceEmbedding,
      sharpness: mediaRecords.sharpness
    })
    .from(mediaRecords)
    .where(and(
      eq(mediaRecords.subjectUuid, subjectUuid),
      eq(mediaRecords.purpose, 'source'),
      eq(mediaRecords.type, 'image'),
      // Only genuine uploaded subject reference photos — exclude generated
      // images (e.g. face-swap outputs) that get stored back as 'source' with
      // a jobId. Real subject uploads never carry a jobId.
      isNull(mediaRecords.jobId)
    ))

  const scored: ScoredImage[] = rows.map((r) => {
    const pixels = (r.width || 0) * (r.height || 0)
    return {
      uuid: r.uuid,
      filename: r.filename,
      width: r.width,
      height: r.height,
      rating: r.rating,
      favorite: !!r.favorite,
      hasFace: !!bufToVec(r.faceEmbedding as Buffer | null),
      megapixels: Math.round(pixels / 1e5) / 10,
      sharpness: r.sharpness != null ? Math.round(r.sharpness * 100) / 100 : null
    }
  })

  // Sort by measured sharpness (highest real detail first). Not-yet-scored
  // images (sharpness NULL) sort behind all scored ones, ordered by resolution
  // as a fallback so the picker stays usable before the backfill runs.
  return sortByTrainingQuality(scored)
}

// ---------------------------------------------------------------------------
// Dataset-readiness assessment (concept picker)
// ---------------------------------------------------------------------------
//
// The S (sharpness) scale is metric-specific (imageSharpness.ts) — these are
// STARTING DIALS, tune once a trained run is seen. Below BLUR_FLOOR_S an image is
// likely too soft to train usefully; below RES_FLOOR_MP it needs heavy upscaling;
// with fewer than MIN_USABLE clear images a concept LoRA isn't worth the hours.
const BLUR_FLOOR_S = 20
const GOOD_S = 40 // a healthy median sharpness for the preselected set
const RES_FLOOR_MP = 0.2 // ~450px
const MIN_USABLE = 15

export interface DatasetAssessment {
  total: number // all tag matches
  usable: number // matches clearing the blur + resolution floors
  goal: number
  preselect: string[] // uuids of the best `goal` usable images
  medianS: number | null // median sharpness of the preselected set
  belowBlur: number // matches under the blur floor
  grade: 'ready' | 'marginal' | 'thin'
  recommendation: string
}

/**
 * Judge whether a concept dataset is worth training and preselect the best
 * images, so a bad dataset is caught BEFORE wasting hours on a run. `scored` must
 * already be composite-sorted (best first). `label` is the concept name for the
 * message.
 */
export function assessConceptDataset(scored: ScoredImage[], goal: number, label: string): DatasetAssessment {
  const g = Math.max(5, goal || 40)
  const usableList = scored.filter((s) =>
    s.sharpness != null &&
    s.sharpness >= BLUR_FLOOR_S &&
    (((s.width || 0) * (s.height || 0)) / 1e6) >= RES_FLOOR_MP
  )
  const preselect = usableList.slice(0, g)
  const sVals = preselect.map((s) => s.sharpness as number).sort((a, b) => a - b)
  const medianS = sVals.length ? Math.round(sVals[Math.floor(sVals.length / 2)]) : null
  const belowBlur = scored.filter((s) => s.sharpness != null && s.sharpness < BLUR_FLOOR_S).length
  const usable = usableList.length

  // Grade on BOTH count (enough usable images to hit the goal) AND quality
  // (median sharpness of the preselected set) — plenty of barely-usable images is
  // still a soft dataset that yields a mediocre LoRA.
  let grade: DatasetAssessment['grade']
  let recommendation: string
  if (usable < MIN_USABLE) {
    grade = 'thin'
    recommendation = `Too thin to train well — only ${usable} clear image${usable === 1 ? '' : 's'} (want ~${Math.max(MIN_USABLE, g)}+, and ${belowBlur} of ${scored.length} matches are below the blur floor). Gather more high-quality "${label}" material (or mark more dest real) before training, or the run is likely wasted.`
  } else if (usable < g) {
    grade = 'marginal'
    recommendation = `Trainable but short of goal — ${usable} usable of ${g} (median S${medianS}). It'll learn "${label}", but a bit weak; more clear, higher-res examples would strengthen it.`
  } else if (medianS != null && medianS < GOOD_S) {
    grade = 'marginal'
    recommendation = `Enough images (${usable}) but on the soft side — median S${medianS} vs ~${GOOD_S}+ for a crisp set (${belowBlur} of ${scored.length} matches were too blurry). It'll train, but expect middling sharpness; more crisp, higher-res "${label}" examples would noticeably help.`
  } else {
    grade = 'ready'
    recommendation = `Good to go — ${usable} usable of your ${g} goal, median S${medianS}. Preselected the best ${preselect.length}; tweak by hand as you like.`
  }
  return { total: scored.length, usable, goal: g, preselect: preselect.map((s) => s.uuid), medianS, belowBlur, grade, recommendation }
}

/**
 * List CONCEPT-training candidate images for the picker: dest images that carry
 * a given WD14 tag, real only (`ai_generated = false` — NULL/undecided and AI are
 * hidden per the manual-provenance design, CONCEPT-TRAINING-PLAN.md §5). No single
 * subject — a concept spans many. Ordered by measured sharpness like the character
 * picker. Requires the target tag to be present in `tags->'tags'` (full WD14 set,
 * so run the full-tag backfill first). Diversity is curated by hand.
 */
export async function scoreConceptImages(tags: string[]): Promise<ScoredImage[]> {
  const clean = tags.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return []
  const db = getDb()
  // AND across tags: an image must carry EVERY selected tag (e.g. pov + anal).
  const tagConds = clean.map((t) => sql`jsonb_exists(${mediaRecords.tags} -> 'tags', ${t})`)
  const rows = await db
    .select({
      uuid: mediaRecords.uuid,
      filename: mediaRecords.filename,
      width: mediaRecords.width,
      height: mediaRecords.height,
      rating: mediaRecords.rating,
      favorite: mediaRecords.favorite,
      faceEmbedding: mediaRecords.faceEmbedding,
      sharpness: mediaRecords.sharpness
    })
    .from(mediaRecords)
    .where(and(
      eq(mediaRecords.purpose, 'dest'),
      eq(mediaRecords.type, 'image'),
      // Real only: known-AI and undecided (NULL) are hidden from the concept pool.
      eq(mediaRecords.aiGenerated, false),
      // Every selected tag present in the full WD14 tag array.
      ...tagConds
    ))

  const scored: ScoredImage[] = rows.map((r) => {
    const pixels = (r.width || 0) * (r.height || 0)
    return {
      uuid: r.uuid,
      filename: r.filename,
      width: r.width,
      height: r.height,
      rating: r.rating,
      favorite: !!r.favorite,
      hasFace: !!bufToVec(r.faceEmbedding as Buffer | null),
      megapixels: Math.round(pixels / 1e5) / 10,
      sharpness: r.sharpness != null ? Math.round(r.sharpness * 100) / 100 : null
    }
  })

  return sortByTrainingQuality(scored)
}

/**
 * Like scoreConceptImages but for dest VIDEOS (the concept Videos tab). Same
 * real-only + all-tags filter; videos carry sharpness from median-of-frames
 * enrichment. Returns `duration` so the picker can show clip length. Sorted by
 * the same composite quality; short clips are what concept video training wants.
 */
export async function scoreConceptVideos(tags: string[]): Promise<ScoredImage[]> {
  const clean = tags.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return []
  const db = getDb()
  const tagConds = clean.map((t) => sql`jsonb_exists(${mediaRecords.tags} -> 'tags', ${t})`)
  const rows = await db
    .select({
      uuid: mediaRecords.uuid,
      filename: mediaRecords.filename,
      width: mediaRecords.width,
      height: mediaRecords.height,
      rating: mediaRecords.rating,
      favorite: mediaRecords.favorite,
      sharpness: mediaRecords.sharpness,
      duration: mediaRecords.duration
    })
    .from(mediaRecords)
    .where(and(
      eq(mediaRecords.purpose, 'dest'),
      eq(mediaRecords.type, 'video'),
      eq(mediaRecords.aiGenerated, false),
      ...tagConds
    ))

  const scored: ScoredImage[] = rows.map((r) => {
    const pixels = (r.width || 0) * (r.height || 0)
    return {
      uuid: r.uuid,
      filename: r.filename,
      width: r.width,
      height: r.height,
      rating: r.rating,
      favorite: !!r.favorite,
      hasFace: false,
      megapixels: Math.round(pixels / 1e5) / 10,
      sharpness: r.sharpness != null ? Math.round(r.sharpness * 100) / 100 : null,
      duration: r.duration != null ? Math.round(r.duration * 10) / 10 : null
    }
  })
  return sortByTrainingQuality(scored)
}

/**
 * Cheap COUNT of real dest images matching ALL given tags — for the concept
 * picker's live match-count as tags are selected (no image payload, no scoring).
 */
export async function countConceptImages(tags: string[]): Promise<number> {
  const clean = tags.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return 0
  const db = getDb()
  const tagConds = clean.map((t) => sql`jsonb_exists(${mediaRecords.tags} -> 'tags', ${t})`)
  const rows = await db
    .select({ n: count() })
    .from(mediaRecords)
    .where(and(
      eq(mediaRecords.purpose, 'dest'),
      eq(mediaRecords.type, 'image'),
      eq(mediaRecords.aiGenerated, false),
      ...tagConds
    ))
  return rows[0]?.n ?? 0
}

// ---------------------------------------------------------------------------
// Dataset export + config generation
// ---------------------------------------------------------------------------

function imageExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'
}

// Strip Florence's boilerplate lead-in ("The image is a photograph of ",
// "A close-up selfie of ", "The image shows ", …) so the trigger word leads the
// caption instead of a generic framing phrase, then lowercase the first letter
// so it flows after "<trigger>, ".
function cleanCaption(s: string): string {
  let c = s.trim()
  const lead = /^\s*(the image|this image|the photo(graph)?|the picture|an?\s+(photo(graph)?|image|picture|close-?up|selfie|portrait))\b[^.]*?\b(of|shows?|showing|depicts?|depicting|featuring|features?|captures?|capturing)\s+/i
  const stripped = c.replace(lead, '')
  if (stripped.length >= 8) c = stripped
  return c.charAt(0).toLowerCase() + c.slice(1)
}

function captionFor(triggerWord: string, tags: unknown, caption?: string | null): string {
  // Prefer the natural-language Florence caption — prose is what Wan2.2's T5
  // encoder learns best from — with the trigger prepended so identity binds to
  // it. Fall back to the WD14 tag list (allowlisted) for images not yet
  // captioned, so a partially-captioned set still trains.
  const prose = typeof caption === 'string' ? caption.trim() : ''
  if (prose) return `${triggerWord}, ${cleanCaption(prose)}`
  const tagList: string[] = Array.isArray((tags as any)?.tags) ? (tags as any).tags : []
  return [triggerWord, ...tagList.slice(0, 20)].join(', ')
}

// Concept-isolation caption: trigger + (WD14 tags MINUS the target tag(s)).
// Dropping the concept tags from the caption forces the trigger to absorb the
// pose/action, while everything else (subject, setting, body) stays described so
// it does NOT bind to the trigger (CONCEPT-TRAINING-PLAN.md §6). Prose is
// intentionally NOT used here — a Florence caption would describe the very pose
// we want to hide.
function captionForConcept(triggerWord: string, tags: unknown, conceptTags: string[]): string {
  const tagList: string[] = Array.isArray((tags as any)?.tags) ? (tags as any).tags : []
  const norm = (t: string) => t.trim().toLowerCase()
  const targets = new Set(conceptTags.map(norm))
  const kept = tagList.filter((t) => !targets.has(norm(t)))
  return [triggerWord, ...kept.slice(0, 20)].join(', ')
}

/**
 * Export the training set (decrypted) + captions and write the three
 * diffusion-pipe TOMLs into the run dir. Idempotent: re-exporting a run
 * replaces the dataset dir but leaves any training output in runs/<id> alone.
 */
export async function prepareTrainingRun(opts: {
  runId: string
  triggerWord: string
  imageUuids: string[]
  config?: TrainingConfig
  // When set, this is a CONCEPT run: captions become trigger + (tags MINUS these
  // tags) so the trigger absorbs the pose (see captionForConcept). Character runs
  // leave it empty and caption normally (prose/tags with the trigger lead).
  conceptTags?: string[]
  // Concept video clips: each is trimmed (start..end secs) + optionally spatial-
  // cropped via ffmpeg into a short training clip. Present → the dataset is mixed
  // image+video and frame_buckets becomes [1, 33].
  videoClips?: Array<{ uuid: string; start: number; end: number; crop?: ClipCrop | null }>
}): Promise<{ datasetDir: string, runDir: string, exported: number }> {
  const { runId, triggerWord, imageUuids } = opts
  const conceptTags = opts.conceptTags && opts.conceptTags.length > 0 ? opts.conceptTags : null
  const cfg = { ...CONFIG_DEFAULTS, ...(opts.config || {}) }
  const datasetDir = path.join(TRAIN_ROOT, 'datasets', runId)
  const runDir = path.join(TRAIN_ROOT, 'runs', runId)

  await rm(datasetDir, { recursive: true, force: true })
  await mkdir(datasetDir, { recursive: true })
  await mkdir(runDir, { recursive: true })

  const db = getDb()
  let exported = 0
  for (const uuid of imageUuids) {
    const fileData = await getMediaFileData(uuid)
    if (!fileData) {
      logger.warn(`🎓 training export: skipping ${uuid} (no data)`)
      continue
    }
    const [record] = await db
      .select({ filename: mediaRecords.filename, tags: mediaRecords.tags, caption: mediaRecords.caption })
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)
    const base = `img_${String(exported).padStart(4, '0')}`
    const ext = imageExtension(record?.filename || '')
    const caption = conceptTags
      ? captionForConcept(triggerWord, record?.tags, conceptTags)
      : captionFor(triggerWord, record?.tags, record?.caption)
    await writeFile(path.join(datasetDir, `${base}${ext}`), fileData.buffer)
    await writeFile(path.join(datasetDir, `${base}.txt`), caption)
    exported++
  }

  // Concept video clips → ffmpeg trim (+ optional crop) each into a short mp4 in
  // the dataset dir, with a same-basename caption (concept-isolation like images).
  const videoClips = opts.videoClips || []
  let videoExported = 0
  for (const clip of videoClips) {
    const fileData = await getMediaFileData(clip.uuid)
    if (!fileData) {
      logger.warn(`🎓 training export: skipping clip ${clip.uuid} (no data)`)
      continue
    }
    const [record] = await db
      .select({ tags: mediaRecords.tags, caption: mediaRecords.caption })
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, clip.uuid))
      .limit(1)
    let clipBuf: Buffer
    try {
      clipBuf = await trimAndCrop(fileData.buffer, { start: clip.start, end: clip.end, crop: clip.crop })
    } catch (e) {
      logger.warn(`🎓 clip trim failed for ${clip.uuid}: ${(e as any)?.message}`)
      continue
    }
    const base = `vid_${String(videoExported).padStart(4, '0')}`
    const caption = conceptTags
      ? captionForConcept(triggerWord, record?.tags, conceptTags)
      : captionFor(triggerWord, record?.tags, record?.caption)
    await writeFile(path.join(datasetDir, `${base}.mp4`), clipBuf)
    await writeFile(path.join(datasetDir, `${base}.txt`), caption)
    videoExported++
  }

  if (exported + videoExported === 0) {
    throw new Error('No training media could be exported')
  }

  // Container-side paths (malris and ktrain both mount the train root at /train)
  const cDataset = `/train/datasets/${runId}`
  const cRun = `/train/runs/${runId}`

  const datasetToml = `# Generated by malris for training run ${runId}
resolutions = [${cfg.resolution}]
enable_ar_bucket = true
min_ar = 0.5
max_ar = 2.0
num_ar_buckets = 7
frame_buckets = [${videoExported > 0 ? '1, 33' : '1'}]

[[directory]]
path = '${cDataset}'
num_repeats = ${cfg.num_repeats}
`

  const expertToml = (expert: 'low' | 'high') => `# Generated by malris for training run ${runId} — ${expert}-noise expert
output_dir = '${cRun}/${expert}'
dataset = '${cRun}/dataset.toml'

epochs = ${cfg.epochs}
micro_batch_size_per_gpu = 1
pipeline_stages = 1
gradient_accumulation_steps = 4
gradient_clipping = 1.0
warmup_steps = 20

blocks_to_swap = 32
activation_checkpointing = 'unsloth'
partition_method = 'parameters'
save_dtype = 'bfloat16'
caching_batch_size = 1
steps_per_print = 1
video_clip_mode = 'single_beginning'

# A LoRA is emitted every epoch (epochN/adapter_model.safetensors, ComfyUI
# format) so a mid-training "Save test LoRA" can grab a fresh snapshot; the
# deepspeed resume checkpoint is on a user-set wall-clock cadence (the slider).
save_every_n_epochs = 1
checkpoint_every_n_minutes = ${cfg.checkpoint_minutes}

[model]
type = 'wan'
ckpt_path = '/train/models/Wan2.2-T2V-A14B'
transformer_path = '/train/models/Wan2.2-T2V-A14B/${expert}_noise_model'
dtype = 'bfloat16'
transformer_dtype = 'float8'
timestep_sample_method = 'logit_normal'
min_t = ${expert === 'low' ? '0.0' : '0.875'}
max_t = ${expert === 'low' ? '0.875' : '1.0'}

[adapter]
type = 'lora'
rank = ${cfg.rank}
dtype = 'bfloat16'

[optimizer]
type = 'AdamW8bitKahan'
lr = ${cfg.lr}
betas = [0.9, 0.99]
weight_decay = 0.01
stabilize = false
`

  await writeFile(path.join(runDir, 'dataset.toml'), datasetToml)
  await writeFile(path.join(runDir, 'low.toml'), expertToml('low'))
  await writeFile(path.join(runDir, 'high.toml'), expertToml('high'))

  logger.info(`🎓 training run ${runId}: exported ${exported} image(s) + ${videoExported} clip(s) to ${datasetDir}, configs in ${runDir}`)
  return { datasetDir, runDir, exported: exported + videoExported }
}

/** Remove a run's dataset + run dir (cancel/delete cleanup). */
export async function removeTrainingRunFiles(runId: string): Promise<void> {
  await rm(path.join(TRAIN_ROOT, 'datasets', runId), { recursive: true, force: true })
  await rm(path.join(TRAIN_ROOT, 'runs', runId), { recursive: true, force: true })
}
