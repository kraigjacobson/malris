#!/usr/bin/env node

/**
 * Cleanup script for orphaned PostgreSQL Large Objects
 * This script removes large objects that are no longer referenced by any media records
 */

import { cleanupOrphanedLargeObjects } from '../server/services/hybridMediaStorage.js'
import { logger } from '../server/utils/logger.js'

async function main() {
  try {
    console.log('🧹 Starting cleanup of orphaned large objects...')
    
    const cleanedCount = await cleanupOrphanedLargeObjects()
    
    if (cleanedCount > 0) {
      console.log(`✅ Successfully cleaned up ${cleanedCount} orphaned large objects`)
    } else {
      console.log('✅ No orphaned large objects found')
    }
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Failed to cleanup orphaned large objects:', error)
    logger.error('Cleanup script failed:', error)
    process.exit(1)
  }
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n🛑 Cleanup interrupted by user')
  process.exit(1)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Cleanup terminated')
  process.exit(1)
})

main()