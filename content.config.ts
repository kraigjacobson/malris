import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    imageMeta: defineCollection({
      source: 'image-meta/*.yml',
      type: 'data',
      schema: z.object({
        uuid: z.string().uuid(),
        filename: z.string(),
        tags: z.array(z.string()).optional(),
        createdAt: z.date(),
        updatedAt: z.date(),
        purpose: z.enum(['src', 'dest', 'test', 'done']),
        status: z.string().optional(),
        baseImageUUID: z.string().uuid().optional(),
        height: z.number().positive(),
        width: z.number().positive(),
        subjectUUID: z.string().uuid()
      })
    }),
    subjects: defineCollection({
      source: 'subjects/*.yml',
      type: 'data',
      schema: z.object({
        uuid: z.string().uuid(),
        name: z.string(),
        tags: z.array(z.string()).optional(),
        createdAt: z.date(),
        updatedAt: z.date(),
      })
    })
  }
})