import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpEnv } from '@corn/shared-types'

/**
 * Analytics tools — exposes Corn tool usage statistics to agents.
 * Enables self-evaluation: "Is Corn making me more effective?"
 */
export function registerAnalyticsTools(server: McpServer, env: McpEnv) {
  const apiUrl = () => (env.DASHBOARD_API_URL || 'http://localhost:4000').replace(/\/$/, '')

  server.tool(
    'corn_tool_stats',
    'View Corn MCP tool usage analytics: success rates, latency, token estimates, and trends. Use to measure Corn effectiveness and identify flaky tools.',
    {
      days: z.number().optional().describe('Time window in days (default: 7)'),
      agentId: z.string().optional().describe('Filter by agent ID'),
      projectId: z.string().optional().describe('Filter by project ID'),
    },
    async ({ days, agentId, projectId }) => {
      try {
        const params = new URLSearchParams()
        if (days) params.set('days', String(days))
        if (agentId) params.set('agentId', agentId)
        if (projectId) params.set('projectId', projectId)

        const res = await fetch(
          `${apiUrl()}/api/analytics/tool-analytics?${params.toString()}`,
          { signal: AbortSignal.timeout(10000) },
        )

        if (!res.ok) {
          return {
            content: [{ type: 'text' as const, text: `Analytics error: ${res.status} ${await res.text()}` }],
            isError: true,
          }
        }

        const data = (await res.json()) as {
          summary: { totalCalls: number; overallSuccessRate: number; estimatedTokensSaved: number; activeAgents: number }
          tools: Array<{ tool: string; totalCalls: number; successRate: number; errorCount: number; avgLatencyMs: number }>
          agents: Array<{ agentId: string; totalCalls: number; successRate: number }>
          trend: Array<{ day: string; calls: number; errors: number }>
        }

        const lines: string[] = []
        lines.push(`## Corn Tool Analytics (last ${days ?? 7} days)\n`)
        lines.push(`**Total calls:** ${data.summary.totalCalls}`)
        lines.push(`**Success rate:** ${data.summary.overallSuccessRate}%`)
        lines.push(`**Active agents:** ${data.summary.activeAgents}`)
        lines.push(`**Est. tokens saved:** ~${data.summary.estimatedTokensSaved.toLocaleString()}\n`)

        if (data.tools.length > 0) {
          lines.push(`### Per-Tool Breakdown\n`)
          lines.push(`| Tool | Calls | Success % | Errors | Avg Latency |`)
          lines.push(`|------|------:|----------:|-------:|------------:|`)
          for (const t of data.tools) {
            const flag = t.successRate < 90 ? '⚠️ ' : t.successRate === 100 ? '✅ ' : ''
            lines.push(`| ${flag}${t.tool} | ${t.totalCalls} | ${t.successRate}% | ${t.errorCount} | ${t.avgLatencyMs}ms |`)
          }
        }

        if (data.agents.length > 0) {
          lines.push(`\n### Per-Agent Breakdown\n`)
          for (const a of data.agents) {
            lines.push(`- **${a.agentId}**: ${a.totalCalls} calls (${a.successRate}% success)`)
          }
        }

        if (data.trend.length > 0) {
          lines.push(`\n### Daily Trend\n`)
          for (const t of data.trend) {
            const bar = '█'.repeat(Math.min(Math.ceil(t.calls / 5), 20))
            lines.push(`${t.day}: ${bar} ${t.calls} calls${t.errors > 0 ? ` (${t.errors} errors)` : ''}`)
          }
        }

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Tool stats error: ${error instanceof Error ? error.message : 'Unknown'}` }],
          isError: true,
        }
      }
    },
  )
}
