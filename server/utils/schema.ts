import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  pgEnum,
  customType,
  boolean,
  serial,
  bigint,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

const oid = customType<{ data: number; notNull: false; default: false }>({
  dataType() {
    return "oid";
  },
});

// Enums
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "active",
  "completed",
  "failed",
  "need_input",
  "canceled",
]);

// Subjects Table (defined first to avoid circular references)
export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  tags: jsonb("tags"), // JSONB field for tags
  note: text("note"),
  thumbnail: uuid("thumbnail"), // Matches the actual database column name
  category: varchar("category", { length: 10 }), // 'celeb' | 'asmr' | 'real' | null (null = infer from name)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// LoRA Metadata Table (per-LoRA info keyed by safetensors filename)
export const loraMetadata = pgTable("lora_metadata", {
  name: varchar("name", { length: 255 }).primaryKey(),
  triggerWords: text("trigger_words"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Job Presets Table
export const jobPresets = pgTable("job_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  jobType: varchar("job_type", { length: 100 }).notNull(),
  prompt: text("prompt"),
  negativePrompt: text("negative_prompt"),
  length: integer("length"),
  // t2v output dimensions (NULL for i2v presets, which derive size from the
  // source image). Saved defaults the form pre-fills; the running job keeps its
  // own width/height in jobs.parameters.
  width: integer("width"),
  height: integer("height"),
  lora1High: varchar("lora_1_high", { length: 255 }),
  lora1Low: varchar("lora_1_low", { length: 255 }),
  lora1HighStrength: real("lora_1_high_strength"),
  lora1LowStrength: real("lora_1_low_strength"),
  lora1HighStrengthOff: boolean("lora_1_high_strength_off").default(false).notNull(),
  lora1LowStrengthOff: boolean("lora_1_low_strength_off").default(false).notNull(),
  lora2High: varchar("lora_2_high", { length: 255 }),
  lora2Low: varchar("lora_2_low", { length: 255 }),
  lora2HighStrength: real("lora_2_high_strength"),
  lora2LowStrength: real("lora_2_low_strength"),
  lora2HighStrengthOff: boolean("lora_2_high_strength_off").default(false).notNull(),
  lora2LowStrengthOff: boolean("lora_2_low_strength_off").default(false).notNull(),
  lora3High: varchar("lora_3_high", { length: 255 }),
  lora3Low: varchar("lora_3_low", { length: 255 }),
  lora3HighStrength: real("lora_3_high_strength"),
  lora3LowStrength: real("lora_3_low_strength"),
  lora3HighStrengthOff: boolean("lora_3_high_strength_off").default(false).notNull(),
  lora3LowStrengthOff: boolean("lora_3_low_strength_off").default(false).notNull(),
  lora4High: varchar("lora_4_high", { length: 255 }),
  lora4Low: varchar("lora_4_low", { length: 255 }),
  lora4HighStrength: real("lora_4_high_strength"),
  lora4LowStrength: real("lora_4_low_strength"),
  lora4HighStrengthOff: boolean("lora_4_high_strength_off").default(false).notNull(),
  lora4LowStrengthOff: boolean("lora_4_low_strength_off").default(false).notNull(),
  lora5High: varchar("lora_5_high", { length: 255 }),
  lora5Low: varchar("lora_5_low", { length: 255 }),
  lora5HighStrength: real("lora_5_high_strength"),
  lora5LowStrength: real("lora_5_low_strength"),
  lora5HighStrengthOff: boolean("lora_5_high_strength_off").default(false).notNull(),
  lora5LowStrengthOff: boolean("lora_5_low_strength_off").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Jobs Table (defined before media records)
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobType: varchar("job_type", { length: 100 }).notNull(), // vid_faceswap, etc.
  status: jobStatusEnum("status").default("queued").notNull(),
  subjectUuid: uuid("subject_uuid")
    .references(() => subjects.id),
  sourceMediaUuid: uuid("source_media_uuid"), // Will add reference later
  destMediaUuid: uuid("dest_media_uuid"), // Will add reference later
  outputUuid: uuid("output_uuid"), // Will add reference later
  // Preset reference. Queued jobs read live preset values via this FK; once
  // queued→active runs, preset values are snapshotted into `parameters` for
  // historical accuracy. ON DELETE SET NULL keeps terminal jobs displayable
  // from their snapshot even after the source preset is removed.
  presetId: uuid("preset_id").references(() => jobPresets.id, { onDelete: "set null" }),
  parameters: jsonb("parameters"), // Snapshot of preset values + non-preset job params (frames_per_batch, etc.)
  progress: integer("progress").default(0).notNull(), // 0-100
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// LoRA Trainings Table (one row per Wan2.2 character-LoRA training run).
// Rides the jobs queue via job_id (job_type='train_lora'); this table holds
// what job rows don't: picked images, training config, published outputs.
// The row id doubles as the filesystem run_id under /train (datasets/<id>,
// runs/<id>) shared with the ktrain trainer container.
export const loraTrainings = pgTable("lora_trainings", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  subjectUuid: uuid("subject_uuid")
    .references(() => subjects.id, { onDelete: "cascade" })
    .notNull(),
  loraName: varchar("lora_name", { length: 100 }).notNull().unique(),
  triggerWord: varchar("trigger_word", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).default("queued").notNull(), // queued | training | paused | completed | failed | canceled
  imageUuids: jsonb("image_uuids").default([]).notNull(), // media_records uuids in the training set
  config: jsonb("config").default({}).notNull(), // { epochs, rank, lr, resolution, num_repeats }
  outputLoras: jsonb("output_loras"), // { high: '<name>_high.safetensors', low: '<name>_low.safetensors' }
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Media Records Table
export const mediaRecords = pgTable("media_records", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  filename: varchar("filename", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // image, video, audio
  purpose: varchar("purpose", { length: 50 }).notNull(), // source, dest, output, intermediate
  status: varchar("status", { length: 50 }), // processing, completed, failed, archived
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  originalSize: bigint("original_size", { mode: "number" }).notNull(),
  width: integer("width"),
  height: integer("height"),
  duration: real("duration"), // for videos/audio
  fps: real("fps"), // frames per second for videos
  codec: varchar("codec", { length: 50 }), // video codec (h264, h265, etc.)
  bitrate: integer("bitrate"), // video bitrate in bits per second
  metadata: jsonb("metadata"), // JSONB field for video metadata (codec, format, etc.)
  tags: jsonb("tags"), // JSONB field for tags
  tagsConfirmed: boolean("tags_confirmed").default(false).notNull(), // Whether tags have been confirmed by user
  subjectUuid: uuid("subject_uuid").references(() => subjects.id),
  sourceMediaUuidRef: uuid("source_media_uuid_ref"), // Self-reference removed for now
  destMediaUuidRef: uuid("dest_media_uuid_ref"), // Self-reference removed for now
  jobId: uuid("job_id").references(() => jobs.id),
  thumbnailUuid: uuid("thumbnail_uuid"), // Self-reference removed for now
  encryptedData: bytea("encrypted_data"), // Binary data for encrypted content (nullable for LOB storage)
  checksum: varchar("checksum", { length: 64 }).notNull(), // SHA256 of ciphertext (legacy; not used for dedup)
  contentSha256: bytea("content_sha256"), // SHA256 of plaintext bytes; UNIQUE where not null. Used for idempotent upload dedup.
  // Perceptual / near-duplicate fingerprints (see server/utils/perceptualHash.ts)
  dhash: bytea("dhash"), // 8-byte whole-image difference hash
  phash: bytea("phash"), // 8-byte whole-image DCT perceptual hash
  tileHashes: jsonb("tile_hashes"), // array of per-tile dHash hex strings (crop matching)
  perceptualHashedAt: timestamp("perceptual_hashed_at", { withTimezone: true }), // NULL = not yet hashed
  // Face embedding for "sort by face similarity" (see server/utils/faceEmbedding.ts)
  faceEmbedding: bytea("face_embedding"), // 512 LE float32s (L2-normalized); NULL = no face / not processed
  faceEmbeddedAt: timestamp("face_embedded_at", { withTimezone: true }), // NULL = not yet processed
  // Large object support columns
  storageType: varchar("storage_type", { length: 10 })
    .default("bytea")
    .notNull(), // 'bytea' or 'lob'
  largeObjectOid: oid("large_object_oid"), // PostgreSQL Large Object OID
  sizeThreshold: bigint("size_threshold", { mode: "number" }).default(
    104857600
  ), // 100MB threshold
  encryptionMethod: varchar("encryption_method", { length: 20 })
    .default("full-file")
    .notNull(), // 'full-file' or 'chunk-based'
  chunkSize: integer("chunk_size").default(1048576), // 1MB chunks for chunk-based encryption
  encryptionMetadata: jsonb("encryption_metadata"), // JSONB field for encryption-specific metadata (ChunkMetadata)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastAccessed: timestamp("last_accessed"),
  accessCount: integer("access_count").default(0).notNull(),
  completions: integer("completions").default(0).notNull(), // for destination videos
  rating: integer("rating"), // user rating 1-5
  favorite: boolean("favorite").default(false).notNull(),
});

// Flagged near-duplicate pairs awaiting human review (see api/media/dedup/*).
// media_a / media_b are stored ordered (media_a < media_b as text) so the
// UNIQUE pair constraint dedupes regardless of discovery direction.
export const mediaDuplicatePairs = pgTable("media_duplicate_pairs", {
  id: serial("id").primaryKey(),
  mediaA: uuid("media_a")
    .notNull()
    .references(() => mediaRecords.uuid, { onDelete: "cascade" }),
  mediaB: uuid("media_b")
    .notNull()
    .references(() => mediaRecords.uuid, { onDelete: "cascade" }),
  method: varchar("method", { length: 10 }).notNull(), // 'dhash' | 'phash' | 'tile'
  distance: integer("distance").notNull(), // Hamming distance, or matched-tile count for 'tile'
  status: varchar("status", { length: 12 }).default("pending").notNull(), // 'pending' | 'dismissed' | 'resolved'
  refinedDiff: real("refined_diff"), // % pixels differing at 128x128 (pixel-level refine); NULL = not refined
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// Categories Table
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  color: varchar("color", { length: 7 }), // Hex color for UI
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Media Record Categories Junction Table (Many-to-Many)
export const mediaRecordCategories = pgTable("media_record_categories", {
  id: serial("id").primaryKey(),
  mediaRecordUuid: uuid("media_record_uuid")
    .references(() => mediaRecords.uuid, { onDelete: "cascade" })
    .notNull(),
  categoryId: integer("category_id")
    .references(() => categories.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type definitions for TypeScript
export type MediaRecord = typeof mediaRecords.$inferSelect;
export type NewMediaRecord = typeof mediaRecords.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type LoraTraining = typeof loraTrainings.$inferSelect;
export type NewLoraTraining = typeof loraTrainings.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type MediaRecordCategory = typeof mediaRecordCategories.$inferSelect;
export type NewMediaRecordCategory = typeof mediaRecordCategories.$inferInsert;
