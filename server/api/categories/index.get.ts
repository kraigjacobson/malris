import { getDb } from '~/server/utils/database'
import { categories } from '~/server/utils/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async (_event) => {
  try {
    const db = getDb()
    
    // Get all categories ordered by name
    const allCategories = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.name))
    
    return {
      success: true,
      categories: allCategories
    }
    
  } catch (error: any) {
    console.error('Categories fetch error:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch categories: ${error.message || 'Unknown error'}`
    })
  }
})