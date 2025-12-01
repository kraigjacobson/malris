import { z } from "zod";

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5).nullable(),
  cascade_to_dest: z.boolean().optional(),
  job_id: z.string().uuid().optional(),
});

/**
 * Update media record rating
 * PUT /api/media/{uuid}/rating
 */
export default defineEventHandler(async (event) => {
  try {
    const uuid = getRouterParam(event, "uuid");

    if (!uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: "UUID parameter is required",
      });
    }

    const body = await readBody(event);

    // Validate rating value
    const validated = ratingSchema.parse(body);
    const { rating, cascade_to_dest, job_id } = validated;

    const { getDbClient } = await import("~/server/utils/database");
    const client = await getDbClient();

    try {
      // Check if record exists and get dest_media_uuid_ref
      const checkQuery =
        "SELECT uuid, dest_media_uuid_ref FROM media_records WHERE uuid = $1";
      const checkResult = await client.query(checkQuery, [uuid]);

      if (checkResult.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Media record not found",
        });
      }

      let destMediaUuid = checkResult.rows[0].dest_media_uuid_ref;

      // If cascade_to_dest is true and job_id is provided, get dest_media_uuid from job
      if (cascade_to_dest && job_id && !destMediaUuid) {
        const jobQuery = "SELECT dest_media_uuid FROM jobs WHERE id = $1";
        const jobResult = await client.query(jobQuery, [job_id]);

        if (jobResult.rows.length > 0 && jobResult.rows[0].dest_media_uuid) {
          destMediaUuid = jobResult.rows[0].dest_media_uuid;
        }
      }

      // Update rating for the main record
      const updateQuery = `
        UPDATE media_records
        SET rating = $1, updated_at = NOW()
        WHERE uuid = $2
        RETURNING rating, updated_at
      `;
      const updateResult = await client.query(updateQuery, [rating, uuid]);

      // Also update the dest media record if it exists and cascade is enabled
      let destUpdated = false;
      if (destMediaUuid && cascade_to_dest) {
        const destUpdateQuery = `
          UPDATE media_records
          SET rating = $1, updated_at = NOW()
          WHERE uuid = $2
        `;
        await client.query(destUpdateQuery, [rating, destMediaUuid]);
        destUpdated = true;
      }

      return {
        success: true,
        message: destUpdated
          ? "Rating updated successfully for both output and destination videos"
          : "Rating updated successfully",
        uuid,
        rating: updateResult.rows[0].rating,
        updatedAt: updateResult.rows[0].updated_at,
        destMediaUuid: destUpdated ? destMediaUuid : null,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    // Handle Zod validation errors
    if (error.name === "ZodError") {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid rating value: ${error.errors
          .map((e: any) => e.message)
          .join(", ")}`,
      });
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Rating update failed: ${
        error.message || "Unknown error"
      }`,
    });
  }
});
