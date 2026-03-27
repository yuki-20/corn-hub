import { Hono } from 'hono'
import { dbAll, dbGet, dbRun } from '../db/client.js'

export const analyticsRouter = new Hono()

// ─── Tool analytics ─────────────────────────────────────
analyticsRouter.get('/tool-analytics', async (c) => {
  const days = Number(c.req.query('days') || '7')
  const agentId = c.req.query('agentId')
  const projectId = c.req.query('projectId')

  let whereClause = `WHERE created_at >= datetime('now', '-' || ? || ' days')`
  const params: unknown[] = [days]
  if (agentId) { whereClause += ' AND agent_id = ?'; params.push(agentId) }
  if (projectId) { whereClause += ' AND project_id = ?'; params.push(projectId) }

  // Summary
  const summary = await dbGet(
    `SELECT COUNT(*) as totalCalls,
            ROUND(100.0 * SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as overallSuccessRate,
            COALESCE(SUM(compute_tokens), 0) as estimatedTokensSaved,
            COALESCE(SUM(input_size + output_size), 0) as totalDataBytes,
            COUNT(DISTINCT agent_id) as activeAgents
     FROM query_logs ${whereClause}`,
    params,
  )

  // Per-tool breakdown
  const tools = await dbAll(
    `SELECT tool,
            COUNT(*) as totalCalls,
            ROUND(100.0 * SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as successRate,
            SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) as errorCount,
            ROUND(AVG(latency_ms), 0) as avgLatencyMs
     FROM query_logs ${whereClause}
     GROUP BY tool ORDER BY totalCalls DESC`,
    params,
  )

  // Per-agent breakdown
  const agents = await dbAll(
    `SELECT agent_id as agentId,
            COUNT(*) as totalCalls,
            ROUND(100.0 * SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as successRate
     FROM query_logs ${whereClause}
     GROUP BY agent_id ORDER BY totalCalls DESC`,
    params,
  )

  // Daily trend
  const trend = await dbAll(
    `SELECT date(created_at) as day,
            COUNT(*) as calls,
            SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) as errors
     FROM query_logs ${whereClause}
     GROUP BY date(created_at) ORDER BY day DESC LIMIT 30`,
    params,
  )

  return c.json({
    summary: {
      totalCalls: summary?.totalCalls || 0,
      overallSuccessRate: summary?.overallSuccessRate || 0,
      estimatedTokensSaved: summary?.estimatedTokensSaved || 0,
      totalDataBytes: summary?.totalDataBytes || 0,
      activeAgents: summary?.activeAgents || 0,
    },
    tools,
    agents,
    trend,
  })
})
