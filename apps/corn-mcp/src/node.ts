import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Load .env file if present (before any other imports that read env)
function loadEnv() {
  const envPaths = [
    resolve(process.cwd(), '.env'),
    resolve(import.meta.dirname || process.cwd(), '..', '.env'),
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

import { serve } from '@hono/node-server'
import app from './index.js'

const port = Number(process.env.PORT) || 8317

serve({ fetch: app.fetch, port }, () => {
  console.log(`🌽 Corn MCP Server listening on http://localhost:${port}`)
  console.log(`   Health: http://localhost:${port}/health`)
  console.log(`   MCP:    http://localhost:${port}/mcp`)
  console.log(`   Embedding: ${process.env['OPENAI_API_BASE'] || 'https://api.voyageai.com/v1'} (${process.env['MEM9_EMBEDDING_MODEL'] || 'voyage-code-3'})`)
})
