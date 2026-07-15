export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.name || !body.job_type) {
    throw createError({ statusCode: 400, statusMessage: 'name and job_type are required' })
  }

  const { getDb } = await import('~/server/utils/database')
  const { jobPresets } = await import('~/server/utils/schema')

  const db = getDb()

  const [preset] = await db.insert(jobPresets).values({
    name: body.name,
    jobType: body.job_type,
    prompt: body.prompt || null,
    negativePrompt: body.negative_prompt || null,
    length: body.length || null,
    width: body.width ?? null,
    height: body.height ?? null,
    lora1High: body.lora_1_high || null,
    lora1Low: body.lora_1_low || null,
    lora1HighStrength: body.lora_1_high_strength ?? null,
    lora1LowStrength: body.lora_1_low_strength ?? null,
    lora1HighStrengthOff: !!body.lora_1_high_strength_off,
    lora1LowStrengthOff: !!body.lora_1_low_strength_off,
    lora2High: body.lora_2_high || null,
    lora2Low: body.lora_2_low || null,
    lora2HighStrength: body.lora_2_high_strength ?? null,
    lora2LowStrength: body.lora_2_low_strength ?? null,
    lora2HighStrengthOff: !!body.lora_2_high_strength_off,
    lora2LowStrengthOff: !!body.lora_2_low_strength_off,
    lora3High: body.lora_3_high || null,
    lora3Low: body.lora_3_low || null,
    lora3HighStrength: body.lora_3_high_strength ?? null,
    lora3LowStrength: body.lora_3_low_strength ?? null,
    lora3HighStrengthOff: !!body.lora_3_high_strength_off,
    lora3LowStrengthOff: !!body.lora_3_low_strength_off,
    lora4High: body.lora_4_high || null,
    lora4Low: body.lora_4_low || null,
    lora4HighStrength: body.lora_4_high_strength ?? null,
    lora4LowStrength: body.lora_4_low_strength ?? null,
    lora4HighStrengthOff: !!body.lora_4_high_strength_off,
    lora4LowStrengthOff: !!body.lora_4_low_strength_off,
    lora5High: body.lora_5_high || null,
    lora5Low: body.lora_5_low || null,
    lora5HighStrength: body.lora_5_high_strength ?? null,
    lora5LowStrength: body.lora_5_low_strength ?? null,
    lora5HighStrengthOff: !!body.lora_5_high_strength_off,
    lora5LowStrengthOff: !!body.lora_5_low_strength_off,
  }).returning()

  return { success: true, preset }
})
