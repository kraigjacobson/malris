import { Pool, type PoolClient } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

// Database connection configuration
const dbConfig = {
  host: 'localhost',
  port: 5433,
  database: 'comfy_media',
  user: 'comfy_user',
  password: 'comfy_secure_password_2024',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}

// Create connection pool
let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(dbConfig)
    
    // Handle pool errors
    pool.on('error', (err: any) => {
      console.error('Unexpected error on idle client', err)
    })
  }
  
  return pool
}

// Get a database client from the pool
export async function getDbClient(): Promise<PoolClient> {
  const pool = getPool()
  return await pool.connect()
}

// Get Drizzle ORM instance
export function getDb() {
  const pool = getPool()
  return drizzle(pool)
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const client = await getDbClient()
    const result = await client.query('SELECT NOW()')
    client.release()
    console.log('✅ Database connection successful:', result.rows[0])
    return true
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    return false
  }
}

// Close all database connections
export async function closeConnections(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}