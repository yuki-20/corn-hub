import { createHash } from 'node:crypto'

// ─── Logger ─────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
}
const RESET = '\x1b[0m'

export function createLogger(service: string): Logger {
  const log = (level: LogLevel, ...args: unknown[]) => {
    const timestamp = new Date().toISOString()
    const color = LOG_COLORS[level]
    const prefix = `${color}[${timestamp}] [${service}] [${level.toUpperCase()}]${RESET}`
    console[level === 'debug' ? 'log' : level](prefix, ...args)
  }

  return {
    debug: (...args) => log('debug', ...args),
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
  }
}

// ─── Error Classes ──────────────────────────────────────

export class CornError extends Error {
  public code: string
  public statusCode: number

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
  ) {
    super(message)
    this.name = 'CornError'
    this.code = code
    this.statusCode = statusCode
  }
}

export class NotFoundError extends CornError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} '${id}' not found` : `${resource} not found`,
      'NOT_FOUND',
      404,
    )
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends CornError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401)
    this.name = 'UnauthorizedError'
  }
}

export class ValidationError extends CornError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}

// ─── Utilities ──────────────────────────────────────────

export function generateId(prefix = ''): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return prefix ? `${prefix}-${hex}` : hex
}

export function hashApiKey(key: string): string {
  // Use node:crypto createHash (imported at top)
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  return createHash('sha256').update(data).digest('hex')
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export function timeAgo(dateStr: string): string {
  // SQLite datetime lacks 'Z' suffix — append it to force UTC parsing
  const normalized = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z'
  const diff = Date.now() - new Date(normalized).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
