import { DatabaseBackupService } from '~/server/utils/backupService'

export default defineEventHandler(async (_event) => {
  try {
    console.log('🔒 Backup API called...')
    
    const backupService = new DatabaseBackupService()
    const result = await backupService.createEncryptedBackup()
    
    if (result.success) {
      console.log('✅ Backup completed successfully')
      return {
        success: true,
        message: result.message,
        data: {
          backupFile: result.backupFile,
          size: result.size,
          timestamp: new Date().toISOString()
        }
      }
    } else {
      console.error('❌ Backup failed:', result.message)
      throw createError({
        statusCode: 500,
        statusMessage: result.message
      })
    }

  } catch (error) {
    console.error('❌ Backup API error:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: `Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    })
  }
})