#!/usr/bin/env node
/**
 * Wrapper around `nuxt dev` that tees the combined stdout/stderr to
 * `logs/dev-stdout.log` (in addition to the structured app-level logs that
 * pino writes to `logs/app.log` from server/utils/logger.ts).
 *
 * Captures everything Nuxt itself prints — HMR updates, build errors, Nitro
 * route warnings, raw console.log — none of which goes through our pino
 * logger. Useful when sharing a failing dev session: paste the file, done.
 *
 * Cross-platform: uses npx so it doesn't care whether nuxt is found via
 * yarn's PATH inject or directly in node_modules/.bin.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const logsDir = path.join(process.cwd(), 'logs')
fs.mkdirSync(logsDir, { recursive: true })

const logFile = path.join(logsDir, 'dev-stdout.log')
const out = fs.createWriteStream(logFile, { flags: 'a' })

const stamp = `\n=== dev session started ${new Date().toISOString()} pid=${process.pid} ===\n`
process.stdout.write(stamp)
out.write(stamp)

// Strip ANSI escape sequences before persisting — colors look great in the
// terminal but turn the log file into unreadable noise (e.g. \x1B[36mℹ\x1B[0m).
const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g

// shell: true is required so Node 20+ on Windows will execute .cmd shims
// (npx.cmd, nuxt.cmd) — without it spawn throws EINVAL. Harmless on Unix.
const child = spawn('npx', ['nuxt', 'dev', '--port', '3003'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
  shell: true
})

function tee(src, dest) {
  src.on('data', (chunk) => {
    dest.write(chunk)
    out.write(String(chunk).replace(ANSI_RE, ''))
  })
}
tee(child.stdout, process.stdout)
tee(child.stderr, process.stderr)

const forward = (sig) => {
  if (!child.pid) return
  try { child.kill(sig) } catch { /* already gone */ }
}
process.on('SIGINT', () => forward('SIGINT'))
process.on('SIGTERM', () => forward('SIGTERM'))

child.on('close', (code) => {
  out.end()
  process.exit(code ?? 0)
})
