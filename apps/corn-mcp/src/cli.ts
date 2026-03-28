#!/usr/bin/env node

// ─── CRITICAL: Intercept ALL console stdout methods BEFORE any imports ───
// The MCP STDIO transport uses stdout for JSON-RPC. Any non-JSON output
// (e.g. ANSI color codes from createLogger, Hono logger middleware) breaks
// the protocol with "invalid character '\x1b'" errors.
//
// In ESM, static `import` statements are hoisted and evaluated before any
// module-level code. So we MUST use dynamic `import()` to ensure console
// patching happens before any dependency code runs.

const _origError = console.error

// Redirect console.log, console.info, console.debug, console.warn to stderr
// (console.error already goes to stderr by default in Node.js)
console.log = (...args: unknown[]) => {
  _origError('[corn-mcp]', ...args)
}
console.info = (...args: unknown[]) => {
  _origError('[corn-mcp]', ...args)
}
console.debug = (...args: unknown[]) => {
  _origError('[corn-mcp]', ...args)
}
console.warn = (...args: unknown[]) => {
  _origError('[corn-mcp]', ...args)
}

// ─── Load .env BEFORE importing anything else ───
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

function loadEnv() {
  const __dirname = typeof import.meta.dirname === 'string'
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url))

  const envPaths = [
    resolve(process.cwd(), '.env'),
    resolve(__dirname, '..', '.env'),
    resolve(__dirname, '.env'),
  ]
  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx === -1) continue
        const key = trimmed.slice(0, eqIdx).trim()
        const value = trimmed.slice(eqIdx + 1).trim()
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
      console.error(`[corn-mcp] Loaded env from ${envPath}`)
      return
    }
  }
}

loadEnv()

// ─── Dynamic imports to ensure console patching runs first ───
async function run() {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { createMcpServer } = await import('./index.js')

  interface Env {
    QDRANT_URL: string
    DASHBOARD_API_URL: string
    MCP_SERVER_NAME: string
    MCP_SERVER_VERSION: string
    API_KEYS: string
    API_KEY_OWNER?: string
  }

  const env: Env = {
    QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
    DASHBOARD_API_URL: process.env.DASHBOARD_API_URL || 'http://localhost:4000',
    MCP_SERVER_NAME: process.env.MCP_SERVER_NAME || 'corn-hub-local',
    MCP_SERVER_VERSION: process.env.MCP_SERVER_VERSION || '0.1.0',
    API_KEYS: '',
  }

  const envWithOwner = { ...env, API_KEY_OWNER: 'local-ide' }

  const server = createMcpServer(envWithOwner)
  const transport = new StdioServerTransport()

  try {
    await server.connect(transport)
    console.error('🌽 Corn MCP Server running locally via STDIO transport')
    console.error(`   Embedding: ${process.env['OPENAI_API_BASE'] || 'https://api.voyageai.com/v1'} (${process.env['MEM9_EMBEDDING_MODEL'] || 'voyage-code-3'})`)
  } catch (error) {
    console.error('Fatal error starting Corn MCP Server:', error)
    process.exit(1)
  }
}

run().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
