import { appendFile, mkdir } from 'fs/promises'
import path from 'path'
import { logger } from './logger'

/**
 * Logs failed upload filenames to a daily log file
 * Files are stored in /app/logs/failed-uploads/ which is accessible on the host via volume mount
 */
export async function logFailedUpload(filename: string, error: string): Promise<void> {
  try {
    // Create date string for filename (YYYY-MM-DD format)
    const today = new Date()
    const dateString = today.toISOString().split('T')[0]
    
    // Create logs directory structure
    const logsDir = path.join('/app', 'logs', 'failed-uploads')
    await mkdir(logsDir, { recursive: true })
    
    // Create daily log filename
    const logFilename = `failed-uploads-${dateString}.log`
    const logFilePath = path.join(logsDir, logFilename)
    
    // Create timestamp for log entry
    const timestamp = new Date().toISOString()
    
    // Format log entry
    const logEntry = `[${timestamp}] ${filename} - ${error}\n`
    
    // Append to daily log file
    await appendFile(logFilePath, logEntry, 'utf8')
    
    logger.info(`📝 Logged failed upload to ${logFilename}: ${filename}`)
    
  } catch (logError) {
    // Don't throw errors for logging failures, just warn
    logger.warn('Failed to log failed upload:', logError)
  }
}