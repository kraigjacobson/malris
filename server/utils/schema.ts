import { pgTable, uuid, varchar, text, integer, real, timestamp, jsonb, pgEnum, customType } from 'drizzle-orm/pg-core'

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

// Enums
export const jobStatusEnum = pgEnum('job_status', ['queued', 'active', 'completed', 'failed', 'need_input', 'canceled'])

// Subjects Table (defined first to avoid circular references)
export const subjects = pgTable('subjects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  tags: jsonb('tags'), // JSONB field for tags
  note: text('note'),
  thumbnail: uuid('thumbnail'), // Matches the actual database column name
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Jobs Table (defined before media records)
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobType: varchar('job_type', { length: 100 }).notNull(), // vid_faceswap, etc.
  status: jobStatusEnum('status').default('queued').notNull(),
  subjectUuid: uuid('subject_uuid').references(() => subjects.id).notNull(),
  sourceMediaUuid: uuid('source_media_uuid'), // Will add reference later
  destMediaUuid: uuid('dest_media_uuid'), // Will add reference later
  outputUuid: uuid('output_uuid'), // Will add reference later
  parameters: jsonb('parameters'), // Job parameters as JSON
  progress: integer('progress').default(0).notNull(), // 0-100
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Media Records Table
export const mediaRecords = pgTable('media_records', {
  uuid: uuid('uuid').primaryKey().defaultRandom(),
  filename: varchar('filename', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // image, video, audio
  purpose: varchar('purpose', { length: 50 }).notNull(), // source, dest, output, intermediate
  status: varchar('status', { length: 50 }), // processing, completed, failed, archived
  fileSize: integer('file_size').notNull(),
  originalSize: integer('original_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  duration: real('duration'), // for videos/audio
  tags: jsonb('tags'), // JSONB field for tags
  subjectUuid: uuid('subject_uuid').references(() => subjects.id),
  sourceMediaUuidRef: uuid('source_media_uuid_ref'), // Self-reference removed for now
  destMediaUuidRef: uuid('dest_media_uuid_ref'), // Self-reference removed for now
  jobId: uuid('job_id').references(() => jobs.id),
  thumbnailUuid: uuid('thumbnail_uuid'), // Self-reference removed for now
  encryptedData: bytea('encrypted_data').notNull(), // Binary data for encrypted content
  checksum: varchar('checksum', { length: 64 }).notNull(), // SHA256 checksum
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastAccessed: timestamp('last_accessed'),
  accessCount: integer('access_count').default(0).notNull(),
  completions: integer('completions').default(0).notNull(), // for destination videos
})

// Type definitions for TypeScript
export type MediaRecord = typeof mediaRecords.$inferSelect
export type NewMediaRecord = typeof mediaRecords.$inferInsert
export type Subject = typeof subjects.$inferSelect
export type NewSubject = typeof subjects.$inferInsert
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert