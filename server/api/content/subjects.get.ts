import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { parse } from 'yaml'

export default defineEventHandler(async (_event) => {
  try {
    const contentDir = join(process.cwd(), 'content', 'subjects')
    const files = await readdir(contentDir)
    const ymlFiles = files.filter(file => file.endsWith('.yml'))
    
    const subjectsData = []
    
    for (const file of ymlFiles) {
      const filePath = join(contentDir, file)
      const fileContent = await readFile(filePath, 'utf-8')
      const parsedData = parse(fileContent)
      subjectsData.push(parsedData)
    }
    
    return subjectsData
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load subjects data',
      data: error
    })
  }
})