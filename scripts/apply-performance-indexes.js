#!/usr/bin/env node

/**
 * Script to apply performance indexes to the jobs table
 * Run this to optimize database query performance
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Client } from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function applyIndexes() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433'),
    database: process.env.DB_NAME || 'comfy_media',
    user: process.env.DB_USER || 'comfy_user',
    password: process.env.DB_PASSWORD || 'comfy_password'
  })

  try {
    console.log('🔌 Connecting to database...')
    await client.connect()
    
    console.log('📊 Reading migration file...')
    const migrationPath = join(__dirname, '../database/migrations/001_add_jobs_performance_indexes.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf8')
    
    console.log('🚀 Applying performance indexes...')
    const startTime = Date.now()
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'))
    
    for (const statement of statements) {
      if (statement.toLowerCase().includes('create index')) {
        const indexName = statement.match(/idx_\w+/)?.[0] || 'unknown'
        console.log(`  📋 Creating index: ${indexName}`)
        await client.query(statement)
      }
    }
    
    const duration = Date.now() - startTime
    console.log(`✅ Performance indexes applied successfully in ${duration}ms`)
    
    // Verify indexes were created
    console.log('🔍 Verifying indexes...')
    const indexQuery = `
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE tablename = 'jobs' 
      AND indexname LIKE 'idx_jobs_%'
      ORDER BY indexname
    `
    
    const result = await client.query(indexQuery)
    console.log(`📊 Found ${result.rows.length} performance indexes:`)
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.indexname}`)
    })
    
  } catch (error) {
    console.error('❌ Error applying indexes:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

// Run the script
applyIndexes().catch(console.error)