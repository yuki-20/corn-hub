import { Hono } from 'hono'
import { dbAll, dbGet, dbRun } from '../db/client.js'
import { readFileSync, existsSync } from 'node:fs'
import { join, normalize, relative } from 'node:path'
import { execSync } from 'node:child_process'
import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'

const execAsync = promisify(execCb)
import {
  analyzeProject,
  searchSymbols,
  getSymbolContext,
  getSymbolImpact,
  executeCypher,
  getProjectStats,
} from '../services/ast-engine.js'

export const intelRouter = new Hono()

/**
 * Resolve a project's local root directory from the database.
 */
async function getProjectRoot(projectId: string): Promise<string | null> {
  const project = await dbGet(
    `SELECT git_repo_url FROM projects WHERE id = ?`,
    [projectId],
  )
  if (!project) return null

  const url = project.git_repo_url as string | null
  if (!url) return null

  // If it's a local path, use it directly
  if (url.startsWith('/') || url.startsWith('C:') || url.startsWith('c:') || url.match(/^[A-Za-z]:\\/)) {
    return existsSync(url) ? url : null
  }

  return null
}

// ── Search ──────────────────────────────────────────────
intelRouter.post('/search', async (c) => {
  try {
    const body = await c.req.json()
    const { query, limit, projectId } = body
    if (!query) return c.json({ error: 'Query is required' }, 400)

    // If projectId is provided and project is indexed, search the graph
    if (projectId) {
      const symbols = await searchSymbols(projectId, query, limit ?? 10)

      if (symbols.length > 0) {
        const lines: string[] = [`🔍 **Search: "${query}"** — ${symbols.length} results\n`]
        const fileGroups = new Map<string, typeof symbols>()

        for (const sym of symbols) {
          const file = sym.file_path as string
          if (!fileGroups.has(file)) fileGroups.set(file, [])
          fileGroups.get(file)!.push(sym)
        }

        for (const [file, syms] of fileGroups) {
          lines.push(`\n### ${file}`)
          for (const s of syms) {
            const exported = s.exported ? '📤' : '  '
            lines.push(`${exported} **${s.kind}** \`${s.name}\` (L${s.start_line}-${s.end_line})`)
            if (s.signature) lines.push(`   \`${(s.signature as string).slice(0, 120)}\``)
          }
        }

        lines.push(`\n---\nNext: \`corn_code_context "${symbols[0].name}"\` for full call graph.`)
        const formatted = lines.join('\n')
        return c.json({ success: true, data: { query, formatted, results: symbols } })
      }
    }

    // Fallback: search all projects
    const allSymbols = await dbAll(
      `SELECT s.name, s.kind, s.file_path, s.start_line, s.exported, p.name as project_name
       FROM code_symbols s JOIN projects p ON s.project_id = p.id
       WHERE s.name LIKE ? OR s.file_path LIKE ? OR s.signature LIKE ?
       ORDER BY s.exported DESC, s.name LIMIT ?`,
      [`%${query}%`, `%${query}%`, `%${query}%`, limit ?? 10],
    )

    if (allSymbols.length > 0) {
      const lines = [`🔍 **Search: "${query}"** — ${allSymbols.length} results across all projects\n`]
      for (const s of allSymbols) {
        lines.push(`- **${s.kind}** \`${s.name}\` in \`${s.file_path}\` (${s.project_name})`)
      }
      return c.json({ success: true, data: { query, formatted: lines.join('\n'), results: allSymbols } })
    }

    return c.json({
      success: true,
      data: {
        query,
        formatted: `🔍 No matching symbols for "${query}". Ensure the project is indexed via the Dashboard → Projects.`,
        results: [],
      },
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ── Context (360° symbol view) ──────────────────────────
intelRouter.post('/context', async (c) => {
  try {
    const body = await c.req.json()
    const { name, projectId, file } = body
    if (!name) return c.json({ error: 'Symbol name is required' }, 400)

    // If no projectId, search all projects
    const effectiveProjectId = projectId || (await dbGet(`SELECT id FROM projects LIMIT 1`))?.id

    if (!effectiveProjectId) {
      return c.json({
        success: true,
        data: { name, results: { raw: `No projects found. Create a project first.` } },
      })
    }

    const ctx = await getSymbolContext(effectiveProjectId, name, file)

    if (!ctx.symbol) {
      return c.json({
        success: true,
        data: {
          name,
          results: {
            raw: `Symbol \`${name}\` not found. Ensure the project is indexed.\n\n💡 Try: \`corn_code_search "${name}"\` for a broader search.`,
          },
        },
      })
    }

    const lines: string[] = []
    const sym = ctx.symbol

    lines.push(`🔍 **Symbol: \`${sym.name}\`** (${sym.kind})`)
    lines.push(`📄 ${sym.file_path}:${sym.start_line}-${sym.end_line}`)
    if (sym.exported) lines.push(`📤 Exported`)
    if (sym.doc_comment) lines.push(`\n> ${sym.doc_comment}`)
    if (sym.signature) lines.push(`\n\`\`\`typescript\n${sym.signature}\n\`\`\``)

    if (ctx.callers.length > 0) {
      lines.push(`\n### 📥 Called by (${ctx.callers.length})`)
      for (const caller of ctx.callers.slice(0, 15)) {
        lines.push(`- \`${caller.name}\` (${caller.kind}) in ${caller.file_path}:${caller.line_number}`)
      }
    }

    if (ctx.callees.length > 0) {
      lines.push(`\n### 📤 Calls (${ctx.callees.length})`)
      for (const callee of ctx.callees.slice(0, 15)) {
        lines.push(`- \`${callee.name}\` (${callee.kind}) in ${callee.file_path}:${callee.line_number}`)
      }
    }

    if (ctx.importedBy.length > 0) {
      lines.push(`\n### 📦 Imported by (${ctx.importedBy.length})`)
      for (const imp of ctx.importedBy.slice(0, 10)) {
        lines.push(`- ${imp.file_path}:${imp.line_number}`)
      }
    }

    if (ctx.extends_.length > 0) {
      lines.push(`\n### 🔗 Extends/Implements`)
      for (const ext of ctx.extends_) {
        lines.push(`- \`${ext.name}\` (${ext.kind}) in ${ext.file_path}`)
      }
    }

    if (ctx.implementedBy.length > 0) {
      lines.push(`\n### 🔗 Extended/Implemented by`)
      for (const impl of ctx.implementedBy) {
        lines.push(`- \`${impl.name}\` (${impl.kind}) in ${impl.file_path}`)
      }
    }

    return c.json({
      success: true,
      data: { name, results: { raw: lines.join('\n'), ...ctx } },
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ── Impact (blast radius analysis) ──────────────────────
intelRouter.post('/impact', async (c) => {
  try {
    const body = await c.req.json()
    const { target, direction, projectId } = body
    if (!target) return c.json({ error: 'Target is required' }, 400)

    const effectiveProjectId = projectId || (await dbGet(`SELECT id FROM projects LIMIT 1`))?.id
    if (!effectiveProjectId) {
      return c.json({
        success: true,
        data: {
          target,
          direction: direction ?? 'downstream',
          results: { raw: 'No projects found.' },
        },
      })
    }

    const result = await getSymbolImpact(effectiveProjectId, target, direction ?? 'downstream')

    if (!result.targetSymbol) {
      return c.json({
        success: true,
        data: {
          target,
          direction: direction ?? 'downstream',
          results: { raw: `Symbol \`${target}\` not found in the indexed project.` },
        },
      })
    }

    const dir = direction ?? 'downstream'
    const lines: string[] = [
      `💥 **Impact Analysis: \`${target}\`** (${dir})`,
      `📄 ${result.targetSymbol.file_path}:${result.targetSymbol.start_line}`,
      `\n**Total affected:** ${result.totalAffected} symbol(s), depth: ${result.depth}`,
    ]

    if (result.impact.length > 0) {
      // Group by depth
      const byDepth = new Map<number, typeof result.impact>()
      for (const item of result.impact) {
        const d = item.depth as number
        if (!byDepth.has(d)) byDepth.set(d, [])
        byDepth.get(d)!.push(item)
      }

      for (const [depth, items] of byDepth) {
        lines.push(`\n### Depth ${depth} (${items.length} symbols)`)
        for (const item of items.slice(0, 15)) {
          const exp = item.exported ? '📤' : '  '
          lines.push(`${exp} \`${item.name}\` (${item.kind}) — ${item.file_path}`)
        }
        if (items.length > 15) lines.push(`... and ${items.length - 15} more`)
      }

      // Risk assessment
      const criticalCount = result.impact.filter(i =>
        (i.file_path as string).includes('index') ||
        (i.kind as string) === 'class' ||
        i.exported,
      ).length
      const risk = criticalCount > 5 ? '🔴 HIGH' : criticalCount > 2 ? '🟡 MEDIUM' : '🟢 LOW'
      lines.push(`\n### Risk: ${risk}`)
      lines.push(`${criticalCount} critical symbol(s) in blast radius`)
    } else {
      lines.push(`\nNo ${dir} dependencies found — symbol appears isolated.`)
    }

    return c.json({
      success: true,
      data: { target, direction: dir, results: { raw: lines.join('\n'), ...result } },
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ── Detect Changes ──────────────────────────────────────
intelRouter.post('/detect-changes', async (c) => {
  try {
    const body = await c.req.json()
    const { scope, projectId } = body
    const selectedScope = scope ?? 'all'

    // Get project root for git operations
    let root: string | null = null
    if (projectId) root = await getProjectRoot(projectId)
    if (!root) root = process.cwd()

    let statusCmd = 'status --porcelain'
    let diffCmd = 'diff --stat'

    if (selectedScope === 'staged') {
      statusCmd = 'diff --cached --name-status'
      diffCmd = 'diff --cached --stat'
    } else if (selectedScope === 'unstaged') {
      statusCmd = 'diff --name-status'
    }

    let status = '', diffStat = '', branch = '', lastCommit = ''
    try {
      const [statusResult, diffResult, branchResult, commitResult] = await Promise.allSettled([
        execAsync(`git ${statusCmd}`, { cwd: root, timeout: 10000, encoding: 'utf-8' }),
        execAsync(`git ${diffCmd}`, { cwd: root, timeout: 10000, encoding: 'utf-8' }),
        execAsync(`git branch --show-current`, { cwd: root, timeout: 5000, encoding: 'utf-8' }),
        execAsync(`git log -1 --oneline`, { cwd: root, timeout: 5000, encoding: 'utf-8' }),
      ])
      if (statusResult.status === 'fulfilled') status = statusResult.value.stdout.trim()
      if (diffResult.status === 'fulfilled') diffStat = diffResult.value.stdout.trim()
      if (branchResult.status === 'fulfilled') branch = branchResult.value.stdout.trim()
      if (commitResult.status === 'fulfilled') lastCommit = commitResult.value.stdout.trim()
    } catch {
      // Not a git repo or git not available
    }

    if (!status && !diffStat) {
      return c.json({
        success: true,
        data: {
          status: 'clean', scope: selectedScope, branch, lastCommit,
          message: 'Working tree is clean.', changedFiles: [], risk: 'none',
        },
      })
    }

    // Parse changed files
    const changedFiles: { file: string; status: string }[] = []
    for (const line of status.split('\n').filter(Boolean)) {
      const match = line.match(/^\s*([MADRCU?!]+)\s+(.+)$/)
      if (match) {
        const statusMap: Record<string, string> = {
          M: 'modified', A: 'added', D: 'deleted', R: 'renamed',
          '??': 'untracked',
        }
        changedFiles.push({ file: match[2]!, status: statusMap[match[1]!] ?? match[1]! })
      }
    }

    // Cross-reference with indexed symbols if project is indexed
    let affectedSymbols: Record<string, unknown>[] = []
    if (projectId) {
      const filePaths = changedFiles.map(f => f.file)
      if (filePaths.length > 0) {
        const conditions = filePaths.map(() => 'file_path LIKE ?').join(' OR ')
        const params = filePaths.map(f => `%${f}%`)
        affectedSymbols = await dbAll(
          `SELECT name, kind, file_path, exported FROM code_symbols
           WHERE project_id = ? AND (${conditions})`,
          [projectId, ...params],
        )
      }
    }

    const criticalFiles = changedFiles.filter(f =>
      f.file.includes('schema') || f.file.includes('index.ts') ||
      f.file.includes('.env') || f.file.includes('package.json'),
    )
    const risk = criticalFiles.length > 0 ? 'high' : changedFiles.length > 5 ? 'medium' : 'low'

    return c.json({
      success: true,
      data: {
        status: 'dirty', scope: selectedScope, branch, lastCommit,
        totalChanges: changedFiles.length, changedFiles,
        affectedSymbols: affectedSymbols.slice(0, 20),
        criticalFiles: criticalFiles.map(f => f.file),
        risk,
        diffSummary: diffStat || 'No diff available',
      },
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ── Cypher ───────────────────────────────────────────────
intelRouter.post('/cypher', async (c) => {
  try {
    const body = await c.req.json()
    const { query: cypherQuery, projectId } = body
    if (!cypherQuery) return c.json({ error: 'Cypher query is required' }, 400)

    const effectiveProjectId = projectId || (await dbGet(`SELECT id FROM projects LIMIT 1`))?.id
    if (!effectiveProjectId) {
      return c.json({ success: true, data: { query: cypherQuery, results: [], message: 'No projects found.' } })
    }

    const results = await executeCypher(effectiveProjectId, cypherQuery)
    return c.json({ success: true, data: { query: cypherQuery, results } })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ── List Repos ──────────────────────────────────────────
intelRouter.get('/repos', async (c) => {
  try {
    const projects = await dbAll(
      `SELECT p.id as projectId, p.slug, p.name, p.git_repo_url, p.indexed_symbols as symbols,
              p.indexed_at, p.description,
              (SELECT COUNT(*) FROM code_symbols WHERE project_id = p.id) as live_symbols,
              (SELECT COUNT(*) FROM code_edges WHERE project_id = p.id) as edges
       FROM projects p ORDER BY p.name`,
    )
    return c.json({ success: true, data: projects })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ── File Content ────────────────────────────────────────
intelRouter.post('/file-content', async (c) => {
  try {
    const body = await c.req.json()
    const { projectId, file, startLine, endLine } = body
    if (!file || !projectId) return c.json({ success: false, error: 'projectId and file are required' }, 400)

    const root = await getProjectRoot(projectId)
    if (!root) {
      return c.json({ success: false, error: 'Project root not found or not a local project' }, 404)
    }

    const filePath = normalize(join(root, file))
    // Security: prevent path traversal
    if (!filePath.startsWith(normalize(root))) {
      return c.json({ success: false, error: 'Path traversal not allowed' }, 403)
    }

    if (!existsSync(filePath)) {
      return c.json({ success: false, error: `File not found: ${file}`, suggestions: [] }, 404)
    }

    const rawContent = readFileSync(filePath, 'utf-8')
    const allLines = rawContent.split('\n')
    const totalLines = allLines.length
    const sizeBytes = Buffer.byteLength(rawContent, 'utf-8')

    const start = startLine ? Math.max(1, startLine) : 1
    const end = endLine ? Math.min(endLine, totalLines) : totalLines
    const content = allLines.slice(start - 1, end).join('\n')

    return c.json({
      success: true,
      data: { file, totalLines, sizeBytes, startLine: start, endLine: end, content },
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ── Index Project (trigger AST analysis) ────────────────
intelRouter.post('/analyze', async (c) => {
  try {
    const body = await c.req.json()
    const { projectId } = body
    if (!projectId) return c.json({ error: 'projectId is required' }, 400)

    const root = await getProjectRoot(projectId)
    if (!root) {
      return c.json({ error: 'Project root not found. Set git_repo_url to a local path.' }, 404)
    }

    const result = await analyzeProject(projectId, root, (progress, message) => {
      // Log progress
      console.log(`[ast-engine] ${progress}% — ${message}`)
    })

    return c.json({ success: true, ...result })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ── Project Stats ───────────────────────────────────────
intelRouter.get('/stats/:projectId', async (c) => {
  try {
    const projectId = c.req.param('projectId')
    const stats = await getProjectStats(projectId)
    return c.json({ success: true, data: stats })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})
