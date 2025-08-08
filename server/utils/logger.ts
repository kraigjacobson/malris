// Server-side logger that doesn't need @nuxt/kit
class ServerLogger {
  private name: string

  constructor(name: string) {
    this.name = name
  }

  private formatMessage(level: string, ...args: any[]): string {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.name}]`
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')
    return `${prefix} ${message}`
  }

  info(...args: any[]) {
    console.log(this.formatMessage('info', ...args))
  }

  error(...args: any[]) {
    console.error(this.formatMessage('error', ...args))
  }

  warn(...args: any[]) {
    console.warn(this.formatMessage('warn', ...args))
  }

  debug(...args: any[]) {
    console.debug(this.formatMessage('debug', ...args))
  }

  log(...args: any[]) {
    console.log(this.formatMessage('log', ...args))
  }
}

// Create a global logger instance with timestamps enabled
export const logger = new ServerLogger('server')