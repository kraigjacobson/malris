import { loraTrainings } from '~/server/utils/schema'

/**
 * Given a job's parameters (with lora_<slot>_<high|low> filename fields), find
 * the subject of the training that produced any selected LoRA. Matches a picked
 * filename against a training either by its published outputs or by its
 * "<lora_name>_" filename prefix (covers test snapshots like
 * <lora>_low_ep15_0707.safetensors). Returns the subject uuid, or null if no
 * selected LoRA maps to a training.
 *
 * Shared by job creation and queued-job editing so both wire the subject
 * through identically (otherwise a t2v job shows "unknown").
 */
export async function deriveSubjectFromLoras(
  db: any,
  params: Record<string, any> | null | undefined
): Promise<string | null> {
  const selectedLoras: string[] = []
  for (const slot of [1, 2, 3, 4, 5]) {
    for (const key of ['high', 'low']) {
      const v = params?.[`lora_${slot}_${key}`]
      if (typeof v === 'string' && v && v !== 'none') selectedLoras.push(v)
    }
  }
  if (selectedLoras.length === 0) return null

  const trainings = await db
    .select({
      subjectUuid: loraTrainings.subjectUuid,
      loraName: loraTrainings.loraName,
      outputLoras: loraTrainings.outputLoras,
    })
    .from(loraTrainings)

  const match = trainings.find((t: any) =>
    selectedLoras.some(f =>
      f.startsWith(`${t.loraName}_`) ||
      Object.values((t.outputLoras as Record<string, string> | null) || {}).includes(f)
    )
  )
  return match?.subjectUuid || null
}
