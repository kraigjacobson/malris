// LoRA strength keys that can be toggled "off" via the per-slider checkbox in
// I2vJobForm. The off-state lives in the params dict as `_<key>_off: true`,
// decoupled from the slider's displayed value so the user's preferred strength
// is preserved across toggles. Call applyLoraDisableOverrides before submitting
// to the backend (or persisting to a preset) to force disabled strengths to 0
// and strip the UI-only flags.

export const LORA_STRENGTH_KEYS = [
  'lora_1_high_strength',
  'lora_1_low_strength',
  'lora_2_high_strength',
  'lora_2_low_strength',
  'lora_3_high_strength',
  'lora_3_low_strength',
  'lora_4_high_strength',
  'lora_4_low_strength',
  'lora_5_high_strength',
  'lora_5_low_strength',
] as const

export function loraOffKey(strengthKey: string): string {
  return `_${strengthKey}_off`
}

export function applyLoraDisableOverrides(params: Record<string, any>): Record<string, any> {
  const out = { ...params }
  for (const key of LORA_STRENGTH_KEYS) {
    const off = loraOffKey(key)
    if (out[off]) out[key] = 0
    delete out[off]
  }
  return out
}
