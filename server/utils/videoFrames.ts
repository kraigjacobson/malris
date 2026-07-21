/**
 * Extract still frames from an in-memory video buffer via ffmpeg (present in the
 * malris container). Used to bring VIDEOS into the image-only analysis paths:
 * sharpness (median over sampled frames) and WD14 tagging (a middle frame). The
 * buffer is written to a temp file because ffmpeg needs seekable input for -ss.
 */
import { spawn } from 'node:child_process'
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args)
    const out: Buffer[] = []
    const err: Buffer[] = []
    p.stdout.on('data', (d: Buffer) => out.push(d))
    p.stderr.on('data', (d: Buffer) => err.push(d))
    p.on('error', reject)
    p.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`${cmd} exit ${code}: ${Buffer.concat(err).toString().slice(0, 200)}`))
    )
  })
}

async function probeDuration(file: string): Promise<number> {
  try {
    const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', file])
    const d = parseFloat(out.toString().trim())
    return Number.isFinite(d) && d > 0 ? d : 0
  } catch {
    return 0
  }
}

/**
 * Return up to `n` JPEG frames sampled evenly across the clip (excluding the very
 * ends). Frames that fail to decode are skipped; an empty array means the video
 * couldn't be read.
 */
export async function extractSampleFrames(videoBuffer: Buffer, n = 3): Promise<Buffer[]> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vframe-'))
  const file = path.join(dir, 'clip')
  try {
    await writeFile(file, videoBuffer)
    const dur = await probeDuration(file)
    const times = dur > 0 ? Array.from({ length: n }, (_, i) => ((i + 1) / (n + 1)) * dur) : [0]
    const frames: Buffer[] = []
    for (const t of times) {
      try {
        const jpg = await run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'])
        if (jpg.length) frames.push(jpg)
      } catch {
        // skip an unreadable frame
      }
    }
    return frames
  } finally {
    try { await rm(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

/** A single representative (middle) frame, or null if the video can't be read. */
export async function extractMiddleFrame(videoBuffer: Buffer): Promise<Buffer | null> {
  const frames = await extractSampleFrames(videoBuffer, 1)
  return frames[0] || null
}

export interface ClipCrop {
  x: number // left, fraction 0..1 of width
  y: number // top, fraction 0..1 of height
  w: number // width, fraction 0..1
  h: number // height, fraction 0..1
}

/**
 * Trim a clip to [start, end] seconds and optionally spatial-crop it (fractions
 * of the frame), re-encoding to h264/yuv420p mp4 — the training dataset clip for
 * concept video LoRAs. Audio is dropped (unused). Returns the mp4 bytes.
 */
export async function trimAndCrop(
  videoBuffer: Buffer,
  opts: { start: number; end: number; crop?: ClipCrop | null }
): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vclip-'))
  const inFile = path.join(dir, 'in')
  const outFile = path.join(dir, 'out.mp4')
  try {
    await writeFile(inFile, videoBuffer)
    const start = Math.max(0, opts.start || 0)
    const dur = Math.max(0.1, (opts.end ?? start) - start)
    // -ss before -i = fast seek; re-encode so the trim is frame-accurate at the cut.
    const args = ['-v', 'error', '-y', '-ss', String(start), '-i', inFile, '-t', String(dur)]
    const c = opts.crop
    if (c && c.w > 0 && c.h > 0 && (c.x !== 0 || c.y !== 0 || c.w !== 1 || c.h !== 1)) {
      // crop=out_w:out_h:x:y as expressions of input dimensions.
      args.push('-vf', `crop=iw*${c.w}:ih*${c.h}:iw*${c.x}:ih*${c.y}`)
    }
    args.push('-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile)
    await run('ffmpeg', args)
    return await readFile(outFile)
  } finally {
    try { await rm(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
