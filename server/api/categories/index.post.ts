import { getDb } from '~/server/utils/database'
import { categories } from '~/server/utils/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { name, color } = body
    
    if (!name || typeof name !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Category name is required and must be a string'
      })
    }
    
    const db = getDb()
    
    // Check if category already exists
    const existingCategory = await db
      .select()
      .from(categories)
      .where(eq(categories.name, name.toLowerCase()))
      .limit(1)
    
    if (existingCategory.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Category already exists'
      })
    }
    
    // Create new category
    const newCategory = await db
      .insert(categories)
      .values({
        name: name.toLowerCase(),
        color: color || '#98D8C8' // Default color
      })
      .returning()
    
    return {
      success: true,
      category: newCategory[0]
    }
    
  } catch (error: any) {
    console.error('Category creation error:', error)
    
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || `Failed to create category: ${error.message || 'Unknown error'}`
    })
  }
})