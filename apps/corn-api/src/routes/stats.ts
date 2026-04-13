import { Hono } from 'hono'
import { dbAll, dbGet, dbRun } from '../db/client.js'

export const metricsRouter = new Hono()

// ─── Log a query (called by MCP server) ─────────────────
metricsRouter.post('/query-log', async (c) => {
  try {
    const body = await c.req.json()

    await dbRun(
      `INSERT INTO query_logs (agent_id, tool, params, latency_ms, status, error, project_id, input_size, output_size, compute_tokens, compute_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.agentId || 'unknown',
        body.tool || 'unknown',
        body.params ? JSON.stringify(body.params) : null,
        body.latencyMs || 0,
        body.status || 'ok',
        body.error || null,
        body.projectId || null,
        body.inputSize || 0,
        body.outputSize || 0,
        body.computeTokens || 0,
        body.computeModel || null,
      ],
    )

    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ─── Get activity feed ──────────────────────────────────
metricsRouter.get('/activity', async (c) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '20', 10) || 20))

    const rows = await dbAll(
      `SELECT id, agent_id, tool, status, latency_ms, created_at
       FROM query_logs ORDER BY created_at DESC LIMIT ?`,
      [limit],
    )

    const activity = rows.map((r) => ({
      type: 'query',
      detail: r.tool,
      agent_id: r.agent_id,
      status: r.status,
      latency_ms: r.latency_ms,
      created_at: r.created_at,
    }))

    return c.json({ activity })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ─── Dashboard overview ─────────────────────────────────
metricsRouter.get('/overview', async (c) => {
  try {
  const projects = await dbAll('SELECT * FROM projects')

  // ── Today's metrics ──
  const today = await dbGet(
    `SELECT COUNT(*) as queries FROM query_logs
     WHERE created_at >= datetime('now', 'start of day')`,
  )
  const todaySessions = await dbGet(
    `SELECT COUNT(*) as count FROM session_handoffs
     WHERE created_at >= datetime('now', 'start of day')`,
  )

  // ── Agent count (7 day window) ──
  const agents = await dbGet(
    `SELECT COUNT(DISTINCT agent_id) as count FROM query_logs
     WHERE created_at >= datetime('now', '-7 days')`,
  )

  // ── Quality metrics ──
  const lastQuality = await dbGet(
    'SELECT grade, score_total FROM quality_reports ORDER BY created_at DESC LIMIT 1',
  )
  const avgScore = await dbGet('SELECT AVG(score_total) as avg FROM quality_reports')
  const qualityToday = await dbGet(
    `SELECT COUNT(*) as count FROM quality_reports
     WHERE created_at >= datetime('now', 'start of day')`,
  )
  const totalReports = await dbGet('SELECT COUNT(*) as count FROM quality_reports')
  const passedReports = await dbGet(
    `SELECT COUNT(*) as count FROM quality_reports WHERE passed = 1`,
  )

  // ── Knowledge metrics ──
  const kbDocs = await dbGet('SELECT COUNT(*) as count FROM knowledge_documents')
  const kbChunks = await dbGet('SELECT COUNT(*) as count FROM knowledge_chunks')
  const kbHits = await dbGet('SELECT COALESCE(SUM(hit_count), 0) as total FROM knowledge_documents')

  // ── Platform counts ──
  const keysCount = await dbGet('SELECT COUNT(*) as count FROM api_keys')
  const sessionsCount = await dbGet('SELECT COUNT(*) as count FROM session_handoffs')
  const orgsCount = await dbGet('SELECT COUNT(*) as count FROM organizations')

  // ── Code intelligence ──
  const indexedSymbols = await dbGet('SELECT COUNT(*) as count FROM code_symbols')
  const indexJobs = await dbGet(
    `SELECT COUNT(*) as count FROM index_jobs WHERE status = 'done'`,
  )

  // ── Tool call & token metrics ──
  const toolCalls = await dbGet(
    `SELECT COUNT(*) as count,
            COALESCE(SUM(compute_tokens), 0) as tokens,
            COALESCE(SUM(input_size + output_size), 0) as dataBytes,
            ROUND(AVG(latency_ms), 0) as avgLatency
     FROM query_logs`,
  )

  // ── Top tools by call volume (top 10) ──
  const topTools = await dbAll(
    `SELECT tool, COUNT(*) as calls,
            COALESCE(SUM(compute_tokens), 0) as tokensSaved,
            ROUND(AVG(latency_ms), 0) as avgLatencyMs,
            COALESCE(SUM(input_size + output_size), 0) as dataBytes,
            ROUND(100.0 * SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as successRate
     FROM query_logs
     GROUP BY tool ORDER BY calls DESC LIMIT 10`,
  )

  // ── Recent sessions (last 5) ──
  const recentSessions = await dbAll(
    `SELECT id, from_agent, project, task_summary, status, created_at
     FROM session_handoffs ORDER BY created_at DESC LIMIT 5`,
  )

  // ── Quality pass rate ──
  const passRate = Number(totalReports?.count) > 0
    ? Math.round((Number(passedReports?.count || 0) / Number(totalReports?.count)) * 100)
    : 0

  return c.json({
    projects,
    totalAgents: agents?.count || 0,
    today: { queries: today?.queries || 0, sessions: todaySessions?.count || 0 },
    quality: {
      lastGrade: lastQuality?.grade || '—',
      averageScore: Math.round(Number(avgScore?.avg) || 0),
      reportsToday: qualityToday?.count || 0,
      totalReports: totalReports?.count || 0,
      passRate,
    },
    knowledge: {
      totalDocs: kbDocs?.count || 0,
      totalChunks: kbChunks?.count || 0,
      totalHits: kbHits?.total || 0,
    },
    indexedSymbols: indexedSymbols?.count || 0,
    completedIndexJobs: indexJobs?.count || 0,
    activeKeys: keysCount?.count || 0,
    totalSessions: sessionsCount?.count || 0,
    organizations: orgsCount?.count || 0,
    uptime: Math.floor(process.uptime()),
    tokenSavings: {
      totalTokensSaved: toolCalls?.tokens || 0,
      totalToolCalls: toolCalls?.count || 0,
      totalDataBytes: toolCalls?.dataBytes || 0,
      avgLatencyMs: toolCalls?.avgLatency || 0,
      avgTokensPerCall:
        Number(toolCalls?.count) > 0
          ? Math.round(Number(toolCalls?.tokens || 0) / Number(toolCalls?.count))
          : 0,
      topTools: topTools.map((t) => ({
        tool: t.tool,
        calls: t.calls,
        tokensSaved: t.tokensSaved,
        avgLatencyMs: t.avgLatencyMs,
        dataBytes: t.dataBytes,
        successRate: t.successRate,
      })),
    },
    recentSessions: recentSessions.map((s) => ({
      id: s.id,
      agent: s.from_agent,
      project: s.project,
      task: s.task_summary,
      status: s.status,
      createdAt: s.created_at,
    })),
  })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ─── Hints engine ───────────────────────────────────────
metricsRouter.get('/hints/:agentId', async (c) => {
  try {
    const currentTool = c.req.query('currentTool') || ''
    const hints: string[] = []

    if (currentTool === 'corn_session_start') {
      hints.push('💡 Use corn_memory_search to recall context from previous sessions')
    }
    if (currentTool === 'corn_memory_store') {
      hints.push('💡 Consider also storing in corn_knowledge_store for team-wide sharing')
    }
    if (currentTool === 'corn_session_end') {
      hints.push('💡 Run corn_quality_report before ending to track quality metrics')
    }

    return c.json({ hints })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})
