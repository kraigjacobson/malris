#!/usr/bin/env node

/**
 * Migration script for converting large BYTEA records to PostgreSQL Large Objects
 * This script migrates existing media records that exceed the size threshold
 */

import { migrateLargeBytea } from '../server/services/hybridMediaStorage.js'
import { logger } from '../server/utils/logger.js'

const DEFAULT_THRESHOLD = 100 * 1024 * 1024 // 100MB

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2)
    let threshold = DEFAULT_THRESHOLD
    let dryRun = false
    
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--threshold' && args[i + 1]) {
        threshold = parseInt(args[i + 1]) * 1024 * 1024 // Convert MB to bytes
        i++ // Skip next argument
      } else if (args[i] === '--dry-run') {
        dryRun = true
      } else if (args[i] === '--help' || args[i] === '-h') {
        showHelp()
        process.exit(0)
      }
    }
    
    console.log('📦 Starting migration of large BYTEA records to Large Objects...')
    console.log(`📏 Threshold: ${Math.round(threshold / (1024 * 1024))}MB`)
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made')
      // TODO: Add dry run functionality to show what would be migrated
      console.log('ℹ️  Dry run functionality not yet implemented')
      process.exit(0)
    }
    
    const migratedCount = await migrateLargeBytea(threshold)
    
    if (migratedCount > 0) {
      console.log(`✅ Successfully migrated ${migratedCount} records from BYTEA to Large Objects`)
    } else {
      console.log('✅ No records needed migration')
    }
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Failed to migrate large BYTEA records:', error)
    logger.error('Migration script failed:', error)
    process.exit(1)
  }
}

function showHelp() {
  console.log(`
📦 Large BYTEA Migration Script

Usage: node migrate-large-bytea.js [options]

Options:
  --threshold <MB>    Size threshold in MB (default: 100)
  --dry-run          Show what would be migrated without making changes
  --help, -h         Show this help message

Examples:
  node migrate-large-bytea.js                    # Migrate records > 100MB
  node migrate-large-bytea.js --threshold 50     # Migrate records > 50MB
  node migrate-large-bytea.js --dry-run          # Preview migration
`)
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n🛑 Migration interrupted by user')
  process.exit(1)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Migration terminated')
  process.exit(1)
})

main()