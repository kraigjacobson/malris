import type { Config } from 'drizzle-kit'

export default {
  schema: './server/utils/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3432'),
    user: process.env.DB_USER || 'comfy_user',
    password: process.env.DB_PASSWORD || 'comfy_secure_password_2024',
    database: process.env.DB_NAME || 'comfy_media',
    ssl: false,
  },
} satisfies Config
