import { Hono } from 'hono'
import { dbAll, dbGet, dbRun } from '../db/client.js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Read version from version.json
let APP_VERSION = '0.2.1'
try {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const versionPath = resolve(__dirname, '..', '..', '..', '..', 'version.json')
  const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'))
  APP_VERSION = versionData.version || APP_VERSION
} catch {}

export const setupRouter = new Hono()

// ─── Get setup status ───────────────────────────────────
setupRouter.get('/', async (c) => {
  try {
    const status = await dbGet('SELECT * FROM setup_status WHERE id = 1')
    return c.json({ completed: !!(status?.completed), completedAt: status?.completed_at })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ─── Complete setup ─────────────────────────────────────
setupRouter.post('/complete', async (c) => {
  try {
    await dbRun(
      `UPDATE setup_status SET completed = 1, completed_at = datetime('now') WHERE id = 1`,
    )
    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ─── System info ────────────────────────────────────────
setupRouter.get('/system', async (c) => {
  try {
    const projects = await dbGet('SELECT COUNT(*) as count FROM projects')
    const keys = await dbGet('SELECT COUNT(*) as count FROM api_keys')
    const providers = await dbGet('SELECT COUNT(*) as count FROM provider_accounts')

    return c.json({
      version: APP_VERSION,
      uptime: Math.floor(process.uptime()),
      projects: projects?.count || 0,
      apiKeys: keys?.count || 0,
      providers: providers?.count || 0,
      database: 'sqlite (sql.js)',
      nodeVersion: process.version,
    })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})
