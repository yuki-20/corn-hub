import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLogger } from '@corn/shared-utils'
import { getDb } from './db/client.js'
import { keysRouter } from './routes/keys.js'
import { sessionsRouter } from './routes/sessions.js'
import { qualityRouter } from './routes/quality.js'
import { knowledgeRouter } from './routes/knowledge.js'
import { projectsRouter, orgsRouter } from './routes/projects.js'
import { metricsRouter } from './routes/stats.js'
import { providersRouter } from './routes/providers.js'
import { usageRouter } from './routes/usage.js'
import { analyticsRouter } from './routes/analytics.js'
import { setupRouter } from './routes/setup.js'
import { webhooksRouter } from './routes/webhooks.js'
import { intelRouter } from './routes/intel.js'
import { systemRouter } from './routes/system.js'
import { indexingRouter } from './routes/indexing.js'

const app = new Hono()
const logger = createLogger('corn-api')

app.use('*', cors())
app.use('*', honoLogger())

// ─── Health ─────────────────────────────────────────────
app.get('/health', async (c) => {
  async function checkService(name: string, url: string): Promise<'ok' | 'error'> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
      return res.ok ? 'ok' : 'error'
    } catch {
      return 'error'
    }
  }

  const qdrantUrl = process.env['QDRANT_URL'] || 'http://localhost:6333'
  const [qdrant] = await Promise.all([
    checkService('qdrant', `${qdrantUrl}/healthz`),
  ])

  return c.json({
    status: qdrant === 'ok' ? 'ok' : 'degraded',
    service: 'corn-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    services: { qdrant },
  })
})

// ─── Routes ─────────────────────────────────────────────
app.route('/api/keys', keysRouter)
app.route('/api/sessions', sessionsRouter)
app.route('/api/quality', qualityRouter)
app.route('/api/knowledge', knowledgeRouter)
app.route('/api/projects', projectsRouter)
app.route('/api/orgs', orgsRouter)
app.route('/api/metrics', metricsRouter)
app.route('/api/analytics', analyticsRouter)
app.route('/api/providers', providersRouter)
app.route('/api/usage', usageRouter)
app.route('/api/setup', setupRouter)
app.route('/api/webhooks', webhooksRouter)
app.route('/api/intel', intelRouter)
app.route('/api/system', systemRouter)
app.route('/api/indexing', indexingRouter)

// ─── Root ───────────────────────────────────────────────
app.get('/', (c) => {
  return c.json({
    name: 'Corn Dashboard API',
    version: '0.1.0',
    endpoints: [
      '/health',
      '/api/keys',
      '/api/sessions',
      '/api/quality',
      '/api/knowledge',
      '/api/projects',
      '/api/orgs',
      '/api/metrics',
      '/api/providers',
      '/api/usage',
      '/api/setup',
    ],
  })
})

// ─── Start ──────────────────────────────────────────────
const port = Number(process.env['PORT']) || 4000

async function start() {
  // Initialize database before serving
  await getDb()
  logger.info('Database ready')

  serve({ fetch: app.fetch, port }, () => {
    logger.info(`🌽 Corn Dashboard API listening on http://localhost:${port}`)
  })
}

start().catch((err) => {
  logger.error('Failed to start:', err)
  process.exit(1)
})
