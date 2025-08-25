import { getDb, closeConnections } from '../server/utils/database.js'
import { mediaRecords } from '../server/utils/schema.js'
import { sql } from 'drizzle-orm'

// Get database instance
const db = getDb()

// Allowed tags
const hairColorTags = ['ginger', 'blonde', 'brunette', 'colored_hair']
const ageBodyTags = ['teen', 'milf', 'chub']
const actionTags = ['rough', 'ass', 'bj', 'multi', 'rule34']
const allowedTags = [...hairColorTags, ...ageBodyTags, ...actionTags]

// Tag mapping for normalization
const tagMapping: Record<string, string> = {
  'orange_hair': 'ginger',
  'red_hair': 'ginger',
  'blonde_hair': 'blonde',
  'black_hair': 'brunette',
  'brown_hair': 'brunette',
  'brunette_hair': 'brunette',
  'multi_colored_hair': 'colored_hair',
  'pink_hair': 'colored_hair',
  'green_hair': 'colored_hair',
  'blue_hair': 'colored_hair'
}

function extractTagsFromRecord(tagsData: any): string[] {
  if (!tagsData) return []
  
  // If it's already an array, return it
  if (Array.isArray(tagsData)) {
    return tagsData.filter((tag: any) => typeof tag === 'string')
  }
  
  // If it's an object with a tags property, extract the tags array
  if (typeof tagsData === 'object' && tagsData.tags && Array.isArray(tagsData.tags)) {
    return tagsData.tags.filter((tag: any) => typeof tag === 'string')
  }
  
  return []
}

async function cleanupTags() {
  try {
    // Check for limit parameter from command line
    const limitArg = process.argv.find(arg => arg.startsWith('--limit='))
    const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined
    
    console.log('Starting comprehensive tag cleanup process...')
    if (limit) {
      console.log(`Processing limited to ${limit} records`)
    }
    
    // Get all records with tags (both array and object formats)
    const baseQuery = db.select({
      uuid: mediaRecords.uuid,
      tags: mediaRecords.tags
    }).from(mediaRecords).where(sql`tags IS NOT NULL`)
    
    const records = limit ? await baseQuery.limit(limit) : await baseQuery
    
    console.log(`Found ${records.length} records with tags to process`)
    
    let updatedCount = 0
    
    for (const record of records) {
      // Extract tags from either array or object format
      const originalTags = extractTagsFromRecord(record.tags)
      
      if (originalTags.length === 0) {
        continue
      }
      
      const normalizedTags: string[] = []
      
      for (const tag of originalTags) {
        // Check if tag needs mapping
        const mappedTag = tagMapping[tag] || tag
        
        // Only keep tags that are in the allowed list
        if (allowedTags.includes(mappedTag)) {
          // Avoid duplicates
          if (!normalizedTags.includes(mappedTag)) {
            normalizedTags.push(mappedTag)
          }
        }
      }
      
      // Always update to convert to simple array format, even if tags didn't change
      const needsUpdate = 
        !Array.isArray(record.tags) || // Convert object format to array
        JSON.stringify(originalTags.sort()) !== JSON.stringify(normalizedTags.sort()) // Tags changed
      
      if (needsUpdate) {
        await db.update(mediaRecords)
          .set({ 
            tags: normalizedTags,
            updatedAt: new Date()
          })
          .where(sql`uuid = ${record.uuid}`)
        
        updatedCount++
        console.log(`Updated record ${record.uuid}: ${originalTags.join(', ')} -> ${normalizedTags.join(', ')}`)
      }
    }
    
    console.log(`Tag cleanup completed. Updated ${updatedCount} records.`)
    
  } catch (error) {
    console.error('Error during tag cleanup:', error)
    throw error
  } finally {
    await closeConnections()
  }
}

// Run the cleanup
cleanupTags().catch(console.error)