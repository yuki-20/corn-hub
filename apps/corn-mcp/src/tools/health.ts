import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpEnv } from '@corn/shared-types'
import { SQLiteVectorStore } from '@corn/shared-mem9'

export function registerHealthTools(server: McpServer, env: McpEnv) {
  server.tool(
    'corn_health',
    'Check Corn Hub system health — services, uptime, version',
    {},
    async () => {
      const services: Record<string, string> = {}

      // Check local vector store
      try {
        const store = new SQLiteVectorStore('./data/mem9-vectors.db')
        const ok = await store.health()
        services.vectorStore = ok ? 'ok' : 'error'
      } catch {
        services.vectorStore = 'error'
      }

      // Check Qdrant (optional — may not be running)
      try {
        const qdrantUrl = env.QDRANT_URL || 'http://localhost:6333'
        const res = await fetch(`${qdrantUrl}/healthz`, {
          signal: AbortSignal.timeout(2000),
        })
        services.qdrant = res.ok ? 'ok' : 'unavailable'
      } catch {
        services.qdrant = 'unavailable (not required)'
      }

      // Check Dashboard API
      try {
        const apiUrl = (env.DASHBOARD_API_URL || 'http://localhost:4000').replace(/\/$/, '')
        const res = await fetch(`${apiUrl}/health`, {
          signal: AbortSignal.timeout(3000),
        })
        services.api = res.ok ? 'ok' : 'error'
      } catch {
        services.api = 'error'
      }

      // Check embedding provider
      const apiKey = process.env['OPENAI_API_KEY'] || ''
      const apiBase = process.env['OPENAI_API_BASE'] || 'https://api.openai.com/v1'
      let embeddingStatus = 'no API key'
      
      if (apiKey && apiKey !== 'proxy-key') {
        try {
          const testRes = await fetch(`${apiBase}/embeddings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ input: ['test'], model: process.env['MEM9_EMBEDDING_MODEL'] || 'text-embedding-3-small' }),
            signal: AbortSignal.timeout(5000),
          })
          embeddingStatus = testRes.ok ? 'ok' : 'invalid key (using local fallback)'
        } catch {
          embeddingStatus = 'unreachable (using local fallback)'
        }
      } else {
        embeddingStatus = 'not configured (using local fallback)'
      }
      services.embeddingProvider = embeddingStatus
      const hasApiKey = embeddingStatus === 'ok'

      const coreOk = services.vectorStore === 'ok' && services.api === 'ok' && hasApiKey

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                status: coreOk ? 'healthy' : 'degraded',
                version: env.MCP_SERVER_VERSION || '0.1.0',
                services,
                embeddingModel: process.env['MEM9_EMBEDDING_MODEL'] || 'text-embedding-3-small',
                embeddingBase: process.env['OPENAI_API_BASE'] || 'https://api.openai.com/v1',
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )
}
