import { Hono } from 'hono'
import { dbAll, dbGet, dbRun } from '../db/client.js'
import { generateId } from '@corn/shared-utils'

export const knowledgeRouter = new Hono()

knowledgeRouter.get('/', async (c) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10) || 50))
    const projectId = c.req.query('projectId')

    let query = 'SELECT * FROM knowledge_documents'
    const params: unknown[] = []

    if (projectId) {
      query += ' WHERE project_id = ?'
      params.push(projectId)
    }
    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const docs = await dbAll(query, params)
    return c.json({ documents: docs })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

knowledgeRouter.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const id = body.id || generateId('kb')

    // BUG-15 fix: Use INSERT ... ON CONFLICT to preserve hit_count, chunk_count, created_at
    await dbRun(
      `INSERT INTO knowledge_documents (id, title, source, source_agent_id, project_id, tags, status, content_preview)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         source = excluded.source,
         source_agent_id = excluded.source_agent_id,
         project_id = excluded.project_id,
         tags = excluded.tags,
         content_preview = excluded.content_preview,
         updated_at = datetime('now')`,
      [
        id,
        body.title,
        body.source || 'manual',
        body.sourceAgentId || null,
        body.projectId || null,
        JSON.stringify(body.tags || []),
        (body.content || '').slice(0, 200),
      ],
    )

    return c.json({ ok: true, id })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

knowledgeRouter.get('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const doc = await dbGet('SELECT * FROM knowledge_documents WHERE id = ?', [id])
    if (!doc) return c.json({ error: 'Not found' }, 404)

    await dbRun('UPDATE knowledge_documents SET hit_count = hit_count + 1 WHERE id = ?', [id])

    return c.json({ document: doc })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

knowledgeRouter.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    await dbRun('DELETE FROM knowledge_documents WHERE id = ?', [id])
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})
