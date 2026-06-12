import { z } from "zod";

const favoriteSchema = z.object({
  favorite: z.boolean(),
});

/**
 * Toggle the per-image favorite flag.
 * PUT /api/media/{uuid}/favorite
 *
 * The bulk i2v create endpoint uses this flag as its filter (one job per
 * favorited source image). Set from the Manage Subject modal.
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
    const { favorite } = favoriteSchema.parse(body);

    const { getDbClient } = await import("~/server/utils/database");
    const client = await getDbClient();

    try {
      const result = await client.query(
        `UPDATE media_records
         SET favorite = $1, updated_at = NOW()
         WHERE uuid = $2
         RETURNING uuid, favorite, updated_at`,
        [favorite, uuid]
      );

      if (result.rows.length === 0) {
        throw createError({
          statusCode: 404,
          statusMessage: "Media record not found",
        });
      }

      return {
        success: true,
        uuid: result.rows[0].uuid,
        favorite: result.rows[0].favorite,
        updatedAt: result.rows[0].updated_at,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }
    if (error.name === "ZodError") {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid favorite value: ${error.errors
          .map((e: any) => e.message)
          .join(", ")}`,
      });
    }
    throw createError({
      statusCode: 500,
      statusMessage: `Favorite update failed: ${error.message || "Unknown error"}`,
    });
  }
});
