import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpEnv } from '@corn/shared-types'
import { getMem9 } from './memory.js'
import { generateId } from '@corn/shared-utils'

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

      // Fetch extra results to account for post-filtering by tags
      const fetchLimit = tags && tags.length > 0 ? (limit ?? 5) * 3 : (limit ?? 5)
      let results = await svc.searchKnowledge(query, fetchLimit, Object.keys(filter).length > 0 ? filter : undefined)

      // Post-filter by tags if specified (vector store doesn't support array matching)
      if (tags && tags.length > 0) {
        const tagSet = new Set(tags.map(t => t.toLowerCase()))
        results = results.filter(r => {
          const payload = r.payload as Record<string, unknown>
          const itemTags = (payload.tags as string[]) || []
          return itemTags.some(t => tagSet.has(t.toLowerCase()))
        }).slice(0, limit ?? 5)
      }

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No knowledge found for: "${query}"${tags?.length ? ` (filtered by tags: ${tags.join(', ')})` : ''}`,
            },
          ],
        }
      }

      const formatted = results
        .map((r: { payload: Record<string, unknown>; score: number }, i: number) => {
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
