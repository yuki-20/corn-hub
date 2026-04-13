import { Hono } from 'hono'
import { dbAll, dbGet, dbRun } from '../db/client.js'
import { generateId } from '@corn/shared-utils'

export const webhooksRouter = new Hono()

// ── Push event (from git hooks, CI, or agents) ──
webhooksRouter.post('/push', async (c) => {
  try {
    const body = await c.req.json()
    const { repo, branch, agentId, commitSha, commitMessage, filesChanged } = body

    if (!repo || !branch) {
      return c.json({ error: 'repo and branch are required' }, 400)
    }

    // Look up project by git URL
    const project = await dbGet(
      `SELECT id FROM projects WHERE git_repo_url = ? OR git_repo_url = ?`,
      [repo, repo.replace(/\.git$/, '')],
    )

    if (!project) {
      return c.json({ ignored: true, reason: 'No matching project found' })
    }

    // Record change event
    const eventId = generateId('chg')
    await dbRun(
      `INSERT INTO change_events (id, project_id, branch, agent_id, commit_sha, commit_message, files_changed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [eventId, project.id, branch, agentId ?? 'local', commitSha ?? '', commitMessage ?? '', JSON.stringify(filesChanged ?? [])],
    )

    return c.json({ received: true, eventId, projectId: project.id })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ── Get unseen changes for an agent ──
webhooksRouter.get('/changes', async (c) => {
  const agentId = c.req.query('agentId')
  const projectId = c.req.query('projectId')
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10) || 20))

  if (!agentId || !projectId) {
    return c.json({ error: 'agentId and projectId are required' }, 400)
  }

  try {
    const ack = await dbGet(
      'SELECT last_seen_event_id FROM agent_ack WHERE agent_id = ? AND project_id = ?',
      [agentId, projectId],
    )

    let events
    if (ack) {
      events = await dbAll(
        `SELECT * FROM change_events
         WHERE project_id = ? AND agent_id != ? AND created_at > COALESCE(
           (SELECT created_at FROM change_events WHERE id = ?),
           datetime('now', '-1 day')
         )
         ORDER BY created_at DESC LIMIT ?`,
        [projectId, agentId, ack.last_seen_event_id, limit],
      )
    } else {
      events = await dbAll(
        `SELECT * FROM change_events
         WHERE project_id = ? AND agent_id != ?
           AND created_at > datetime('now', '-1 day')
         ORDER BY created_at DESC LIMIT ?`,
        [projectId, agentId, limit],
      )
    }

    return c.json({ events, count: events.length })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ── Acknowledge changes ──
webhooksRouter.post('/changes/ack', async (c) => {
  try {
    const { agentId, projectId, lastSeenEventId } = await c.req.json()
    if (!agentId || !projectId || !lastSeenEventId) {
      return c.json({ error: 'agentId, projectId, and lastSeenEventId are required' }, 400)
    }

    await dbRun(
      `INSERT INTO agent_ack (agent_id, project_id, last_seen_event_id, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(agent_id, project_id)
       DO UPDATE SET last_seen_event_id = excluded.last_seen_event_id, updated_at = datetime('now')`,
      [agentId, projectId, lastSeenEventId],
    )

    return c.json({ acknowledged: true })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})
