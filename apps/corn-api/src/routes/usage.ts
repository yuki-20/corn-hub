import { Hono } from 'hono'
import { dbAll, dbGet, dbRun } from '../db/client.js'

export const usageRouter = new Hono()

// ─── Get usage stats ────────────────────────────────────
usageRouter.get('/', async (c) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(c.req.query('days') || '30', 10) || 30))

  const totalTokens = await dbGet(
    `SELECT COALESCE(SUM(total_tokens), 0) as total, COUNT(*) as requests
     FROM usage_logs WHERE created_at >= datetime('now', '-' || ? || ' days')`,
    [days],
  )

  const byModel = await dbAll(
    `SELECT model, SUM(prompt_tokens) as prompt_tokens, SUM(completion_tokens) as completion_tokens,
            SUM(total_tokens) as total_tokens, COUNT(*) as requests
     FROM usage_logs WHERE created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY model ORDER BY total_tokens DESC`,
    [days],
  )

  const byAgent = await dbAll(
    `SELECT agent_id, SUM(total_tokens) as total_tokens, COUNT(*) as requests
     FROM usage_logs WHERE created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY agent_id ORDER BY total_tokens DESC`,
    [days],
  )

  const daily = await dbAll(
    `SELECT date(created_at) as date, SUM(total_tokens) as tokens, COUNT(*) as requests
     FROM usage_logs WHERE created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY date(created_at) ORDER BY date DESC`,
    [days],
  )

  return c.json({
    totalTokens: totalTokens?.total || 0,
    totalRequests: totalTokens?.requests || 0,
    byModel,
    byAgent,
    daily,
  })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ─── Log usage (called by MCP server for LLM proxy) ────
usageRouter.post('/', async (c) => {
  try {
    const body = await c.req.json()

    await dbRun(
      `INSERT INTO usage_logs (agent_id, model, prompt_tokens, completion_tokens, total_tokens, project_id, request_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        body.agentId || 'unknown',
        body.model || 'unknown',
        body.promptTokens || 0,
        body.completionTokens || 0,
        body.totalTokens || 0,
        body.projectId || null,
        body.requestType || 'chat',
      ],
    )

    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})
