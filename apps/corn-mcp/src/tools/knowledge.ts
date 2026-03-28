import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpEnv } from '@corn/shared-types'
import { LocalMem9Service, OpenAIEmbeddingProvider, LocalHashEmbeddingProvider } from '@corn/shared-mem9'
import type { EmbeddingProvider } from '@corn/shared-mem9'
import { generateId } from '@corn/shared-utils'

let mem9: LocalMem9Service | null = null

async function createEmbedder(): Promise<EmbeddingProvider> {
  const apiKey = process.env['OPENAI_API_KEY'] || ''
  const apiBase = process.env['OPENAI_API_BASE'] || 'https://api.voyageai.com/v1'
  const model = process.env['MEM9_EMBEDDING_MODEL'] || 'voyage-code-3'
  const dims = Number(process.env['MEM9_EMBEDDING_DIMS']) || 1024

  if (apiKey) {
    try {
      const testEmbedder = new OpenAIEmbeddingProvider(apiKey, apiBase, model, dims)
      await testEmbedder.embed(['test'])
      return testEmbedder
    } catch {
      // Fall through to local embeddings
    }
  }

  return new LocalHashEmbeddingProvider(256)
}

let initPromise: Promise<LocalMem9Service> | null = null

function getMem9(env: McpEnv): Promise<LocalMem9Service> {
  if (mem9) return Promise.resolve(mem9)
  if (!initPromise) {
    initPromise = createEmbedder().then((embedder) => {
      mem9 = new LocalMem9Service(embedder, './data/mem9-vectors.db')
      return mem9
    })
  }
  return initPromise
}

export function registerKnowledgeTools(server: McpServer, env: McpEnv) {
  // ─── Store Knowledge ─────────────────────────────────
  server.tool(
    'corn_knowledge_store',
    'Store a knowledge item in the shared knowledge base. Use for bug fixes, patterns, decisions, and conventions that should be available to all agents.',
    {
      title: z.string().describe('Title of the knowledge item'),
      content: z.string().describe('The knowledge content'),
      projectId: z.string().optional().describe('Associated project'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
    },
    async ({ title, content, projectId, tags }) => {
      const svc = await getMem9(env)
      const id = generateId('kb')
      const agentId = (env as McpEnv & { API_KEY_OWNER?: string }).API_KEY_OWNER || 'unknown'

      // Store locally with SQLite vector search
      await svc.storeKnowledge(id, content, {
        title,
        agent_id: agentId,
        project_id: projectId || null,
        tags: tags || [],
        source: 'agent',
      })

      // Also register in Dashboard API if available
      try {
        const apiUrl = (env.DASHBOARD_API_URL || 'http://localhost:4000').replace(/\/$/, '')
        await fetch(`${apiUrl}/api/knowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            title,
            content,
            source: 'agent',
            sourceAgentId: agentId,
            projectId: projectId || null,
            tags: tags || [],
          }),
          signal: AbortSignal.timeout(5000),
        })
      } catch {
        // Dashboard API registration is best-effort
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `✅ Knowledge stored: "${title}" (id: ${id})\n\nTags: ${(tags || []).join(', ') || 'none'}`,
          },
        ],
      }
    },
  )

  // ─── Search Knowledge ────────────────────────────────
  server.tool(
    'corn_knowledge_search',
    'Search the shared knowledge base semantically. Find bug fixes, patterns, decisions, and conventions contributed by any agent.',
    {
      query: z.string().describe('Natural language search query'),
      limit: z.number().optional().default(5).describe('Max results'),
      projectId: z.string().optional().describe('Filter by project'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
    },
    async ({ query, limit, projectId, tags }) => {
      const svc = await getMem9(env)

      const filter: Record<string, unknown> = {}
      if (projectId) filter.project_id = projectId

      const results = await svc.searchKnowledge(query, limit, Object.keys(filter).length > 0 ? filter : undefined)

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No knowledge found for: "${query}"`,
            },
          ],
        }
      }

      const formatted = results
        .map((r, i) => {
          const payload = r.payload as Record<string, unknown>
          return `${i + 1}. **${payload.title || 'Untitled'}** [Score: ${r.score.toFixed(3)}]\n   By: ${payload.agent_id || 'unknown'} | Tags: ${((payload.tags as string[]) || []).join(', ') || 'none'}\n   ${(payload.content as string || '').slice(0, 200)}${(payload.content as string || '').length > 200 ? '...' : ''}`
        })
        .join('\n\n')

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${results.length} knowledge items:\n\n${formatted}`,
          },
        ],
      }
    },
  )
}
