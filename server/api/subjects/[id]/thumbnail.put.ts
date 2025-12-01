import { eq } from "drizzle-orm";
import { subjects, mediaRecords } from "~/server/utils/schema";
import { getDb } from "~/server/utils/database";

export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, "id");
    const body = await readBody(event);

    if (!id) {
      throw createError({
        statusCode: 400,
        statusMessage: "Subject ID is required",
      });
    }

    const { thumbnail_uuid } = body;

    if (!thumbnail_uuid) {
      throw createError({
        statusCode: 400,
        statusMessage: "thumbnail_uuid is required",
      });
    }

    const db = getDb();

    // Verify the media record exists and is an image
    const mediaRecord = await db
      .select({
        uuid: mediaRecords.uuid,
        type: mediaRecords.type,
      })
      .from(mediaRecords)
      .where(eq(mediaRecords.uuid, thumbnail_uuid))
      .limit(1);

    if (!mediaRecord || mediaRecord.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Media record not found",
      });
    }

    if (mediaRecord[0].type !== "image") {
      throw createError({
        statusCode: 400,
        statusMessage: "Only images can be set as thumbnails",
      });
    }

    // Update the subject's thumbnail
    const updated = await db
      .update(subjects)
      .set({
        thumbnail: thumbnail_uuid,
        updatedAt: new Date(),
      })
      .where(eq(subjects.id, id))
      .returning();

    if (!updated || updated.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: "Subject not found",
      });
    }

    return {
      success: true,
      message: "Thumbnail updated successfully",
      subject: updated[0],
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update subject thumbnail: ${
        error.message || "Unknown error"
      }`,
    });
  }
});
