import { Hono } from 'hono'
import { dbAll, dbGet, dbRun } from '../db/client.js'
import { generateId } from '@corn/shared-utils'

export const providersRouter = new Hono()

// ─── List providers ─────────────────────────────────────
providersRouter.get('/', async (c) => {
  try {
    const providers = await dbAll('SELECT * FROM provider_accounts ORDER BY created_at DESC')
    return c.json({ providers })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ─── Create provider ────────────────────────────────────
providersRouter.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const id = generateId('prov')

    await dbRun(
      `INSERT INTO provider_accounts (id, name, type, auth_type, api_base, api_key, status, capabilities, models)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        body.name,
        body.type || 'openai',
        body.authType || 'api_key',
        body.apiBase,
        body.apiKey || null,
        body.status || 'enabled',
        JSON.stringify(body.capabilities || ['chat']),
        JSON.stringify(body.models || []),
      ],
    )

    return c.json({ ok: true, id })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ─── Update provider ────────────────────────────────────
providersRouter.patch('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const body = await c.req.json()

    const fields: string[] = []
    const values: unknown[] = []

    if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name) }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status) }
    if (body.apiBase !== undefined) { fields.push('api_base = ?'); values.push(body.apiBase) }
    if (body.apiKey !== undefined) { fields.push('api_key = ?'); values.push(body.apiKey) }
    if (body.models !== undefined) { fields.push('models = ?'); values.push(JSON.stringify(body.models)) }
    if (body.capabilities !== undefined) { fields.push('capabilities = ?'); values.push(JSON.stringify(body.capabilities)) }

    fields.push("updated_at = datetime('now')")
    values.push(id)

    await dbRun(`UPDATE provider_accounts SET ${fields.join(', ')} WHERE id = ?`, values)
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ─── Delete provider ────────────────────────────────────
providersRouter.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    await dbRun('DELETE FROM provider_accounts WHERE id = ?', [id])
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})
