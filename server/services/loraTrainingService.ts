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
import { eq, and } from 'drizzle-orm'
import { getDb } from '~/server/utils/database'
import { mediaRecords } from '~/server/utils/schema'
import { bufToVec, dot } from '~/server/utils/faceEmbedding'
import { getMediaFileData } from './mediaService'
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
  viability: number // 0-100
  diversityOrder: number // greedy max-min rank, 0 = most representative seed
}

/**
 * Score a subject's source images for training viability and diversity.
 *
 * Viability uses what's already on media_records (no image decode):
 * resolution vs the training target, user rating, favorite flag, and whether
 * a face embedding exists (no face found = unusable for a character LoRA).
 *
 * Diversity is a greedy max-min ordering over the 512-d face embeddings:
 * start from the most viable face image, then repeatedly take the image whose
 * embedding is farthest (min cosine sim) from everything already picked —
 * so preselecting the first N gives varied angles/expressions, not near-dupes.
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
      faceEmbedding: mediaRecords.faceEmbedding
    })
    .from(mediaRecords)
    .where(and(
      eq(mediaRecords.subjectUuid, subjectUuid),
      eq(mediaRecords.purpose, 'source'),
      eq(mediaRecords.type, 'image')
    ))

  const scored = rows.map((r) => {
    const vec = bufToVec(r.faceEmbedding as Buffer | null)
    const pixels = (r.width || 0) * (r.height || 0)
    // Resolution: full marks at >= 1024^2 source pixels (plenty for 512 buckets)
    const resScore = Math.min(1, pixels / (1024 * 1024))
    const ratingScore = r.rating ? (r.rating - 1) / 4 : 0.5 // unrated = neutral
    const faceScore = vec ? 1 : 0
    // Face presence dominates; resolution and curation split the rest
    const viability = Math.round(100 * (0.5 * faceScore + 0.3 * resScore + 0.15 * ratingScore + (r.favorite ? 0.05 : 0)))
    return {
      uuid: r.uuid,
      filename: r.filename,
      width: r.width,
      height: r.height,
      rating: r.rating,
      favorite: !!r.favorite,
      hasFace: !!vec,
      viability,
      diversityOrder: Number.MAX_SAFE_INTEGER,
      _vec: vec
    }
  })

  // Greedy max-min diversity ordering over the embedded images
  const embedded = scored.filter(s => s._vec)
  if (embedded.length > 0) {
    const seed = embedded.reduce((a, b) => (b.viability > a.viability ? b : a))
    const picked: typeof embedded = [seed]
    seed.diversityOrder = 0
    const remaining = new Set(embedded.filter(s => s !== seed))
    while (remaining.size > 0) {
      let best: (typeof seed) | null = null
      let bestDist = -Infinity
      for (const cand of remaining) {
        // distance to the closest already-picked image (1 - cosine sim)
        let minDist = Infinity
        for (const p of picked) {
          minDist = Math.min(minDist, 1 - dot(cand._vec!, p._vec!))
        }
        if (minDist > bestDist) {
          bestDist = minDist
          best = cand
        }
      }
      best!.diversityOrder = picked.length
      picked.push(best!)
      remaining.delete(best!)
    }
  }

  // Faceless images sort to the very end regardless of other signals
  return scored
    .map(({ _vec, ...rest }) => rest)
    .sort((a, b) => a.diversityOrder - b.diversityOrder || b.viability - a.viability)
}

// ---------------------------------------------------------------------------
// Dataset export + config generation
// ---------------------------------------------------------------------------

function imageExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'
}

function captionFor(triggerWord: string, tags: unknown): string {
  const tagList: string[] = Array.isArray((tags as any)?.tags) ? (tags as any).tags : []
  // Trigger word first, then up to 20 WD14 tags for regularization
  return [triggerWord, ...tagList.slice(0, 20)].join(', ')
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
}): Promise<{ datasetDir: string, runDir: string, exported: number }> {
  const { runId, triggerWord, imageUuids } = opts
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
      .select({ filename: mediaRecords.filename, tags: mediaRecords.tags })
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, uuid))
      .limit(1)
    const base = `img_${String(exported).padStart(4, '0')}`
    const ext = imageExtension(record?.filename || '')
    await writeFile(path.join(datasetDir, `${base}${ext}`), fileData.buffer)
    await writeFile(path.join(datasetDir, `${base}.txt`), captionFor(triggerWord, record?.tags))
    exported++
  }
  if (exported === 0) {
    throw new Error('No training images could be exported')
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
frame_buckets = [1]

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

  logger.info(`🎓 training run ${runId}: exported ${exported} images to ${datasetDir}, configs in ${runDir}`)
  return { datasetDir, runDir, exported }
}

/** Remove a run's dataset + run dir (cancel/delete cleanup). */
export async function removeTrainingRunFiles(runId: string): Promise<void> {
  await rm(path.join(TRAIN_ROOT, 'datasets', runId), { recursive: true, force: true })
  await rm(path.join(TRAIN_ROOT, 'runs', runId), { recursive: true, force: true })
}
