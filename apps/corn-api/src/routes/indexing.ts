import { Hono } from 'hono'
import { dbAll, dbGet, dbRun } from '../db/client.js'
import { generateId, createLogger } from '@corn/shared-utils'
import { analyzeProject } from '../services/ast-engine.js'

const logger = createLogger('indexing')

export const indexingRouter = new Hono()

// ── Start Indexing (triggers native AST analysis) ──
indexingRouter.post('/:id/index', async (c) => {
  const projectId = c.req.param('id')
  try {
    const project = await dbGet('SELECT id, git_repo_url, name FROM projects WHERE id = ?', [projectId])
    if (!project) return c.json({ error: 'Project not found' }, 404)
    if (!project.git_repo_url) return c.json({ error: 'No git repository URL/path configured' }, 400)

    const activeJob = await dbGet(
      `SELECT id FROM index_jobs WHERE project_id = ? AND status IN ('pending', 'cloning', 'analyzing', 'ingesting')`,
      [projectId],
    )
    if (activeJob) return c.json({ error: 'An indexing job is already running', jobId: activeJob.id }, 409)

    let branch = 'main'
    try { const body = await c.req.json(); if (body.branch) branch = body.branch } catch {}

    const jobId = generateId('idx')
    await dbRun(
      `INSERT INTO index_jobs (id, project_id, branch, status, progress, started_at)
       VALUES (?, ?, ?, 'analyzing', 0, datetime('now'))`,
      [jobId, projectId, branch],
    )

    // Run AST analysis (in background — don't block the response)
    const rootDir = project.git_repo_url as string
    logger.info(`Starting indexing for ${project.name} at ${rootDir}`)

    // Fire and forget the analysis
    ;(async () => {
      try {
        const result = await analyzeProject(projectId, rootDir, async (progress, message) => {
          await dbRun(
            `UPDATE index_jobs SET progress = ?, log = ?, status = 'analyzing' WHERE id = ?`,
            [progress, message, jobId],
          )
        })

        await dbRun(
          `UPDATE index_jobs SET status = 'done', progress = 100,
           total_files = ?, symbols_found = ?,
           completed_at = datetime('now'),
           log = ? WHERE id = ?`,
          [result.filesAnalyzed, result.symbolsFound,
           `Completed: ${result.filesAnalyzed} files, ${result.symbolsFound} symbols, ${result.edgesFound} edges`,
           jobId],
        )

        logger.info(`Indexing complete for ${project.name}: ${result.symbolsFound} symbols, ${result.edgesFound} edges`)
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        logger.error(`Indexing failed for ${project.name}:`, errMsg)
        await dbRun(
          `UPDATE index_jobs SET status = 'error', error = ?, completed_at = datetime('now') WHERE id = ?`,
          [errMsg, jobId],
        )
      }
    })()

    return c.json({ jobId, status: 'analyzing', branch, message: `AST analysis started for ${project.name}` }, 201)
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ── Get Index Status ──
indexingRouter.get('/:id/index/status', async (c) => {
  const projectId = c.req.param('id')
  try {
    const job = await dbGet(
      `SELECT * FROM index_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
      [projectId],
    )
    if (!job) return c.json({ status: 'none', message: 'No indexing jobs found' })

    return c.json({
      jobId: job.id,
      branch: job.branch,
      status: job.status,
      progress: job.progress,
      totalFiles: job.total_files,
      symbolsFound: job.symbols_found,
      log: job.log,
      error: job.error,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      createdAt: job.created_at,
    })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ── Get Index History ──
indexingRouter.get('/:id/index/history', async (c) => {
  const projectId = c.req.param('id')
  const limit = Math.min(50, Number(c.req.query('limit') || '10'))

  try {
    const jobs = await dbAll(
      `SELECT id, branch, status, progress, total_files, symbols_found, error,
              triggered_by, started_at, completed_at, created_at
       FROM index_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`,
      [projectId, limit],
    )
    return c.json({ jobs })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// ── Cancel Job ──
indexingRouter.post('/:id/index/cancel', async (c) => {
  const projectId = c.req.param('id')
  try {
    const activeJob = await dbGet(
      `SELECT id FROM index_jobs WHERE project_id = ? AND status IN ('pending', 'cloning', 'analyzing', 'ingesting') ORDER BY created_at DESC LIMIT 1`,
      [projectId],
    )
    if (!activeJob) return c.json({ error: 'No active indexing job found' }, 404)

    await dbRun(
      `UPDATE index_jobs SET status = 'error', error = 'Cancelled by user', completed_at = datetime('now') WHERE id = ?`,
      [activeJob.id],
    )
    return c.json({ success: true, jobId: activeJob.id })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})
