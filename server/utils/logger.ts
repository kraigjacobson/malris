/**
 * Server-side logger backed by pino.
 *
 * - Dev: pretty-printed lines to the console AND structured JSONL to a rotating
 *   file at `<cwd>/logs/app.log` (10MB or daily, keeps 10, gzips rotated).
 * - Prod: structured JSONL to stdout (for `docker logs`) AND to the same rotating file.
 *
 * Exposes the same varargs API as the previous `ServerLogger` so existing call
 * sites (`logger.info('text', someObject)`) work unchanged. Mirrors the setup
 * in X:/repos/girlfriend-bot/server/utils/logger.ts so log artifacts feel the
 * same across both projects.
 */
import pino from 'pino'
import path from 'path'
import fs from 'fs'
import { createStream } from 'rotating-file-stream'
import pinoPretty from 'pino-pretty'

const isProduction = process.env.NODE_ENV === 'production'

// Ensure logs directory exists at the project root (next to package.json).
const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Rotating file: 10MB or daily, keep last 10, gzip rotated.
const rotatingStream = createStream('app.log', {
  size: '10M',
  interval: '1d',
  maxFiles: 10,
  compress: 'gzip',
  path: logsDir
})

const loggerOptions = {
  level: isProduction ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  // Strip hostname; keep pid and name (name set per-child below).
  formatters: {
    bindings: (b: any) => ({ pid: b.pid })
  }
}

let baseLogger: pino.Logger

if (!isProduction) {
  const prettyStream = pinoPretty({
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname,name'
  })
  baseLogger = pino(
    loggerOptions,
    pino.multistream([
      { level: 'debug', stream: prettyStream },
      { level: 'debug', stream: rotatingStream }
    ])
  )
} else {
  baseLogger = pino(
    loggerOptions,
    pino.multistream([
      { level: 'info', stream: process.stdout },
      { level: 'info', stream: rotatingStream }
    ])
  )
}

// Existing call sites use `logger.info('text', someObject)` (varargs joined into
// one message). Pino's native API takes (mergeObj, msg) instead. Shim the varargs
// shape so we don't have to rewrite every call site.
function joinArgs(args: any[]): string {
  return args
    .map(a => {
      if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`
      if (typeof a === 'object') return JSON.stringify(a, null, 2)
      return String(a)
    })
    .join(' ')
}

class ServerLogger {
  private p: pino.Logger

  constructor(name: string) {
    this.p = baseLogger.child({ name })
  }

  info(...args: any[])  { this.p.info(joinArgs(args)) }
  error(...args: any[]) { this.p.error(joinArgs(args)) }
  warn(...args: any[])  { this.p.warn(joinArgs(args)) }
  debug(...args: any[]) { this.p.debug(joinArgs(args)) }
  log(...args: any[])   { this.p.info(joinArgs(args)) }
}

export function createLogger(name: string) {
  return new ServerLogger(name)
}

// Default logger preserves the existing import path: `import { logger } from '~/server/utils/logger'`
export const logger = new ServerLogger('server')

export default logger
