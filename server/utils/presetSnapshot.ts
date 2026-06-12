/**
 * Helpers for the preset-reference / snapshot lifecycle on jobs.
 *
 * Queued jobs hold only `presetId`; they resolve preset values live for
 * display and worker submission. At queued→active transition we snapshot the
 * preset's current values into `jobs.parameters` so terminal jobs retain
 * historical accuracy even if the preset is later edited or deleted.
 */

import type { jobPresets } from './schema'

type PresetRow = typeof jobPresets.$inferSelect

// Parameter keys that come from the preset definition. These are stripped on
// job creation (preset_id is the source of truth) and re-populated at the
// queued→active snapshot. Keep in sync with the columns on jobPresets.
export const PRESET_PARAM_KEYS = [
  'prompt',
  'negative_prompt',
  'length',
  'lora_1_high',
  'lora_1_low',
  'lora_1_high_strength',
  'lora_1_low_strength',
  'lora_2_high',
  'lora_2_low',
  'lora_2_high_strength',
  'lora_2_low_strength',
  'lora_3_high',
  'lora_3_low',
  'lora_3_high_strength',
  'lora_3_low_strength',
  'lora_4_high',
  'lora_4_low',
  'lora_4_high_strength',
  'lora_4_low_strength',
  'lora_5_high',
  'lora_5_low',
  'lora_5_high_strength',
  'lora_5_low_strength',
  '_preset_id',
  '_preset_name',
] as const

// Drop preset-derived keys from an incoming parameters dict so they don't
// linger as a stale snapshot on a queued job. Non-preset keys (frames_per_batch,
// skip_seconds, video_filename, etc.) are preserved.
export function stripPresetFields(params: Record<string, any> | null | undefined): Record<string, any> {
  if (!params) return {}
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(params)) {
    if (!(PRESET_PARAM_KEYS as readonly string[]).includes(k)) {
      out[k] = v
    }
  }
  return out
}

// Resolve the parameters dict to display for a job. If the job carries a
// snapshot (we detect this by `_preset_id` being present in params, which only
// `buildPresetSnapshot` writes), use the snapshot verbatim — that's the
// frozen historical record. Otherwise, if the job has a live preset
// reference, synthesize the dict from the preset's current values. Otherwise
// (e.g. vid_faceswap), return params as-is.
export function resolveJobParameters(
  jobParams: Record<string, any> | null | undefined,
  presetId: string | null | undefined,
  preset: PresetRow | null | undefined,
): Record<string, any> {
  const params = jobParams || {}
  if (params._preset_id) return params
  if (presetId && preset) return buildPresetSnapshot(preset, params)
  return params
}

// Build the parameters snapshot for a job that's about to go active. Merges
// preset values over any non-preset params already on the job (the latter is
// usually empty for i2v but may carry frames_per_batch etc. for other types).
// Disabled strengths (per the preset's `*_off` flags) are zeroed here — the
// worker reads only the strength columns and doesn't know about the flags.
export function buildPresetSnapshot(preset: PresetRow, existingParams: Record<string, any> | null | undefined): Record<string, any> {
  const effective = (strength: number | null, off: boolean) => (off ? 0 : strength)
  return {
    ...(existingParams || {}),
    _preset_id: preset.id,
    _preset_name: preset.name,
    prompt: preset.prompt,
    negative_prompt: preset.negativePrompt,
    length: preset.length,
    lora_1_high: preset.lora1High,
    lora_1_low: preset.lora1Low,
    lora_1_high_strength: effective(preset.lora1HighStrength, preset.lora1HighStrengthOff),
    lora_1_low_strength: effective(preset.lora1LowStrength, preset.lora1LowStrengthOff),
    lora_2_high: preset.lora2High,
    lora_2_low: preset.lora2Low,
    lora_2_high_strength: effective(preset.lora2HighStrength, preset.lora2HighStrengthOff),
    lora_2_low_strength: effective(preset.lora2LowStrength, preset.lora2LowStrengthOff),
    lora_3_high: preset.lora3High,
    lora_3_low: preset.lora3Low,
    lora_3_high_strength: effective(preset.lora3HighStrength, preset.lora3HighStrengthOff),
    lora_3_low_strength: effective(preset.lora3LowStrength, preset.lora3LowStrengthOff),
    lora_4_high: preset.lora4High,
    lora_4_low: preset.lora4Low,
    lora_4_high_strength: effective(preset.lora4HighStrength, preset.lora4HighStrengthOff),
    lora_4_low_strength: effective(preset.lora4LowStrength, preset.lora4LowStrengthOff),
    lora_5_high: preset.lora5High,
    lora_5_low: preset.lora5Low,
    lora_5_high_strength: effective(preset.lora5HighStrength, preset.lora5HighStrengthOff),
    lora_5_low_strength: effective(preset.lora5LowStrength, preset.lora5LowStrengthOff),
  }
}
