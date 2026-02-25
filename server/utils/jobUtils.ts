import { logger } from '~/server/utils/logger'

/**
 * Determines the sourceMediaUuid for a job.
 *
 * If the subject has exactly 1 source image, the source workflow can be skipped —
 * there's nothing to pick from, so we use that image directly as the reference.
 *
 * @param db - Drizzle DB instance
 * @param subjectUuid - The subject's UUID
 * @param requestedSourceMediaUuid - Explicitly provided source media UUID (takes precedence)
 * @returns The sourceMediaUuid to use, or null if the source workflow is needed
 */
export async function resolveSourceMediaUuid(
  db: any,
  subjectUuid: string,
  requestedSourceMediaUuid?: string | null
): Promise<string | null> {
  // Honor an explicitly provided source
  if (requestedSourceMediaUuid) {
    return requestedSourceMediaUuid
  }

  const { mediaRecords } = await import('~/server/utils/schema')
  const { and, eq } = await import('drizzle-orm')

  const subjectImages = await db
    .select({ uuid: mediaRecords.uuid })
    .from(mediaRecords)
    .where(and(
      eq(mediaRecords.subjectUuid, subjectUuid),
      eq(mediaRecords.purpose, 'source'),
      eq(mediaRecords.type, 'image')
    ))

  if (subjectImages.length === 1) {
    logger.info(`Subject ${subjectUuid} has 1 source image — skipping source workflow, using ${subjectImages[0].uuid} as reference`)
    return subjectImages[0].uuid
  }

  return null
}
