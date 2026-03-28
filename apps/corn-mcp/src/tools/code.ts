import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpEnv } from '@corn/shared-types'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve, normalize, relative } from 'node:path'

/**
 * Code intelligence tools — powered by native TypeScript AST engine.
 * Queries Dashboard API which uses a built-in AST engine (no external GitNexus).
 */
export function registerCodeTools(server: McpServer, env: McpEnv) {
  const apiUrl = () => (env.DASHBOARD_API_URL || 'http://localhost:4000').replace(/\/$/, '')

  // ── Resolve project root for local fallbacks ──
  function getProjectRoot(): string {
    let dir = process.cwd()
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(dir, '.git'))) return dir
      const parent = resolve(dir, '..')
      if (parent === dir) break
      dir = parent
    }
    return process.cwd()
  }

  function execGit(args: string, cwd?: string): string {
    try {
      return execSync(`git ${args}`, {
        cwd: cwd ?? getProjectRoot(),
        timeout: 10000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
    } catch {
      return ''
    }
  }

  async function callIntel(endpoint: string, params: Record<string, unknown>, timeoutMs = 15000): Promise<unknown> {
    const res = await fetch(`${apiUrl()}/api/intel/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new Error(`${endpoint} failed: ${res.status} ${await res.text()}`)
    return res.json()
  }

  // ── corn_code_search — semantic codebase search ──
  server.tool(
    'corn_code_search',
    'Search the codebase for architecture concepts, execution flows, and file matches using hybrid vector/AST search. Supply projectId to scope to a specific project.',
    {
      query: z.string().describe('Natural language or code query'),
      projectId: z.string().optional().describe('Project ID to scope search to'),
      branch: z.string().optional().describe('Git branch to search'),
      limit: z.number().optional().describe('Max results (default: 5)'),
    },
    async ({ query, projectId, branch, limit }) => {
      try {
        // Try the API (native AST engine)
        let formatted = ''
        try {
          const data = (await callIntel('search', {
            query, projectId, branch, limit: limit ?? 5,
          })) as { data?: { formatted?: string }; success?: boolean }
          formatted = data?.data?.formatted ?? ''
        } catch {
          // API unavailable — use local git grep fallback
          const terms = query.split(/\s+/).filter(w => w.length > 3).slice(0, 3)
          if (terms.length > 0) {
            const grepResults = execGit(`grep -n -i --color=never "${terms.join('\\|')}" -- "*.ts" "*.tsx" "*.js" "*.jsx" | head -30`)
            if (grepResults) {
              const lines = ['📄 **Local Search Results** (git grep fallback)\n']
              const resultLines = grepResults.split('\n').slice(0, 20)
              let currentFile = ''
              for (const line of resultLines) {
                const match = line.match(/^([^:]+):(\d+):(.*)$/)
                if (match) {
                  const [, file, lineNum, content] = match
                  if (file !== currentFile) {
                    currentFile = file!
                    lines.push(`\n### ${file}`)
                  }
                  lines.push(`L${lineNum}: ${content!.trim()}`)
                }
              }
              formatted = lines.join('\n')
            }
          }
        }

        if (!formatted) {
          formatted = `🔍 No results found for "${query}". Ensure a project is indexed.`
        }

        return { content: [{ type: 'text' as const, text: formatted }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Code search error: ${error instanceof Error ? error.message : 'Unknown'}` }], isError: true }
      }
    },
  )

  // ── corn_code_read — read raw source file ──
  server.tool(
    'corn_code_read',
    'Read raw source code from an indexed repository. Returns full file or a line range. Use after corn_code_search to view files.',
    {
      file: z.string().describe('Relative file path (e.g., "src/utils/auth.ts")'),
      projectId: z.string().describe('Project ID'),
      startLine: z.number().optional().describe('Start line (1-indexed)'),
      endLine: z.number().optional().describe('End line (1-indexed)'),
    },
    async ({ file, projectId, startLine, endLine }) => {
      // Try API first (with project path resolution)
      try {
        const res = await fetch(`${apiUrl()}/api/intel/file-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, file, startLine, endLine }),
          signal: AbortSignal.timeout(10000),
        })
        const data = (await res.json()) as {
          success?: boolean
          data?: { file?: string; totalLines?: number; content?: string; startLine?: number; endLine?: number; sizeBytes?: number }
          error?: string
        }

        if (res.ok && data.success && data.data?.content) {
          const d = data.data
          const ext = (d.file ?? file).split('.').pop() ?? ''
          const lang = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', go: 'go', rs: 'rust', css: 'css', json: 'json', sql: 'sql' }[ext] ?? ext
          const header = `📄 **${d.file ?? file}** (${d.totalLines} lines${d.sizeBytes ? `, ${Math.round(d.sizeBytes / 1024)}KB` : ''})`
          const range = d.startLine && d.endLine && (startLine || endLine) ? `\nLines ${d.startLine}-${d.endLine}` : ''
          return { content: [{ type: 'text' as const, text: `${header}${range}\n\n\`\`\`${lang}\n${d.content}\n\`\`\`` }] }
        }
      } catch { /* API unavailable — fall through to local */ }

      // Local filesystem fallback
      try {
        const root = getProjectRoot()
        const filePath = normalize(join(root, file))

        if (!filePath.startsWith(root)) {
          return { content: [{ type: 'text' as const, text: `Error: Path traversal not allowed` }], isError: true }
        }

        if (!existsSync(filePath)) {
          const suggestions = findSimilarFiles(root, file)
          let msg = `File not found: ${file}`
          if (suggestions.length > 0) {
            msg += '\n\nDid you mean:\n' + suggestions.map(s => `  → ${s}`).join('\n')
          }
          return { content: [{ type: 'text' as const, text: msg }], isError: true }
        }

        const rawContent = readFileSync(filePath, 'utf-8')
        const allLines = rawContent.split('\n')
        const totalLines = allLines.length
        const sizeBytes = Buffer.byteLength(rawContent, 'utf-8')
        const start = startLine ? Math.max(1, startLine) : 1
        const end = endLine ? Math.min(endLine, totalLines) : totalLines
        const selectedLines = allLines.slice(start - 1, end)
        const numberedContent = selectedLines.map((line, i) => `${String(start + i).padStart(4, ' ')} │ ${line}`).join('\n')

        const ext = file.split('.').pop() ?? ''
        const lang = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', go: 'go', rs: 'rust', css: 'css', json: 'json', sql: 'sql' }[ext] ?? ext
        const header = `📄 **${file}** (${totalLines} lines, ${Math.round(sizeBytes / 1024)}KB) — *local read*`
        const range = (startLine || endLine) ? `\nLines ${start}-${end} of ${totalLines}` : ''

        return { content: [{ type: 'text' as const, text: `${header}${range}\n\n\`\`\`${lang}\n${numberedContent}\n\`\`\`` }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Code read error: ${error instanceof Error ? error.message : 'Unknown'}` }], isError: true }
      }
    },
  )

  // ── corn_code_context — 360° symbol view (AST-powered) ──
  server.tool(
    'corn_code_context',
    'Get a 360° view of a code symbol: its methods, callers, callees, and related execution flows. Essential for exploring class hierarchies.',
    {
      name: z.string().describe('Function, class, or symbol to explore'),
      projectId: z.string().optional().describe('Project ID'),
      file: z.string().optional().describe('File path to disambiguate'),
    },
    async ({ name, projectId, file }) => {
      try {
        const data = (await callIntel('context', { name, projectId, file })) as {
          data?: { results?: { raw?: string } }
        }
        const raw = data?.data?.results?.raw
        if (raw) return { content: [{ type: 'text' as const, text: raw }] }
        return { content: [{ type: 'text' as const, text: `Symbol \`${name}\` not found. Ensure the project is indexed.` }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Context error: ${error instanceof Error ? error.message : 'Unknown'}. Is corn-api running?` }], isError: true }
      }
    },
  )

  // ── corn_code_impact — blast radius analysis (AST-powered) ──
  server.tool(
    'corn_code_impact',
    'Analyze the blast radius of changing a specific symbol (function, class, file) to verify downstream impact before making edits.',
    {
      target: z.string().describe('Function, class, or file to analyze'),
      projectId: z.string().optional().describe('Project ID'),
      branch: z.string().optional().describe('Git branch'),
      direction: z.enum(['upstream', 'downstream']).optional().describe('Direction (default: downstream)'),
    },
    async ({ target, projectId, branch, direction }) => {
      try {
        const data = (await callIntel('impact', {
          target, projectId, branch, direction: direction ?? 'downstream',
        })) as { data?: { results?: { raw?: string } } }
        const raw = data?.data?.results?.raw
        if (raw) return { content: [{ type: 'text' as const, text: raw }] }
        return { content: [{ type: 'text' as const, text: `No impact data for \`${target}\`. Ensure the project is indexed.` }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Impact error: ${error instanceof Error ? error.message : 'Unknown'}. Is corn-api running?` }], isError: true }
      }
    },
  )

  // ── corn_detect_changes — pre-commit risk analysis (AST-powered) ──
  server.tool(
    'corn_detect_changes',
    'Detect uncommitted changes and analyze their risk level. Shows changed symbols, affected processes, and risk assessment.',
    {
      scope: z.string().optional().describe('"all" (default), "staged", or "unstaged"'),
      projectId: z.string().optional().describe('Project ID'),
    },
    async ({ scope, projectId }) => {
      try {
        const data = (await callIntel('detect-changes', { scope: scope ?? 'all', projectId })) as {
          success?: boolean; data?: unknown
        }
        if (data?.success && data.data) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(data.data, null, 2) }] }
        }
      } catch { /* API unavailable */ }

      // Local fallback
      try {
        const selectedScope = scope ?? 'all'
        let statusCmd = 'status --porcelain'
        if (selectedScope === 'staged') statusCmd = 'diff --cached --name-status'
        else if (selectedScope === 'unstaged') statusCmd = 'diff --name-status'

        const status = execGit(statusCmd)
        const branch = execGit('branch --show-current')
        const lastCommit = execGit('log -1 --oneline')

        if (!status) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'clean', scope: selectedScope, branch, lastCommit, message: 'Working tree is clean.' }, null, 2) }] }
        }

        const changedFiles: { file: string; status: string }[] = []
        for (const line of status.split('\n').filter(Boolean)) {
          const match = line.match(/^\s*([MADRCU?!]+)\s+(.+)$/)
          if (match) changedFiles.push({ file: match[2]!, status: match[1]! })
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'dirty', scope: selectedScope, branch, lastCommit, totalChanges: changedFiles.length, changedFiles }, null, 2) }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Change detection error: ${error instanceof Error ? error.message : 'Unknown'}` }], isError: true }
      }
    },
  )

  // ── corn_cypher — graph queries (AST-powered, translated to SQL) ──
  server.tool(
    'corn_cypher',
    'Run Cypher queries against the code knowledge graph. Supports MATCH, RETURN, WHERE, ORDER BY.\nExample: MATCH (n) WHERE n.name CONTAINS "Auth" RETURN n.name, labels(n) LIMIT 20',
    {
      query: z.string().describe('Cypher query'),
      projectId: z.string().optional().describe('Project ID'),
    },
    async ({ query, projectId }) => {
      try {
        const data = (await callIntel('cypher', { query, projectId })) as {
          success?: boolean; data?: { results?: unknown[] }
        }
        if (data?.success && data.data?.results) {
          const results = data.data.results
          if (Array.isArray(results) && results.length > 0) {
            // Format as table
            const keys = Object.keys(results[0] as Record<string, unknown>)
            const lines = [`🔍 **Cypher Query Results** (${results.length} rows)\n`]
            lines.push(`| ${keys.join(' | ')} |`)
            lines.push(`|${keys.map(() => '---').join('|')}|`)
            for (const row of results.slice(0, 30) as Record<string, unknown>[]) {
              lines.push(`| ${keys.map(k => String(row[k] ?? '')).join(' | ')} |`)
            }
            if (results.length > 30) lines.push(`\n... ${results.length - 30} more rows`)
            return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
          }
          return { content: [{ type: 'text' as const, text: JSON.stringify(data.data, null, 2) }] }
        }
        return { content: [{ type: 'text' as const, text: `No results for query. Ensure the project is indexed.` }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `Cypher error: ${error instanceof Error ? error.message : 'Unknown'}. Is corn-api running?` }], isError: true }
      }
    },
  )

  // ── corn_list_repos — discover indexed repositories ──
  server.tool(
    'corn_list_repos',
    'List all indexed repositories with project ID mapping. Use this to find which projectId to pass to code tools.',
    {},
    async () => {
      try {
        const res = await fetch(`${apiUrl()}/api/intel/repos`, { signal: AbortSignal.timeout(10000) })
        if (!res.ok) throw new Error(`Failed: ${res.status}`)
        const data = (await res.json()) as { data?: unknown }
        const repos = Array.isArray(data?.data) ? data.data : []

        if (repos.length === 0) {
          return { content: [{ type: 'text' as const, text: '📦 No indexed repositories found.\n\n💡 Use the Dashboard → Projects to add and index a repository.' }] }
        }

        const lines = ['📦 **Indexed Repositories**\n', '| # | Repository | Project ID | Symbols | Edges | Indexed |', '|---|-----------|-----------|---------|-------|---------|']
        let i = 0
        for (const r of repos as Record<string, unknown>[]) {
          i++
          const symbols = r.live_symbols ?? r.symbols ?? '?'
          const edges = r.edges ?? '?'
          const indexed = r.indexed_at ? '✅' : '⏳'
          lines.push(`| ${i} | **${r.name ?? 'unknown'}** | \`${r.projectId ?? '(auto)'}\` | ${symbols} | ${edges} | ${indexed} |`)
        }
        lines.push('', `Total: ${repos.length} projects.`, '\n💡 Pass the Project ID to corn_code_search, corn_code_context, corn_code_impact, or corn_cypher.')

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `List repos error: ${error instanceof Error ? error.message : 'Unknown'}` }], isError: true }
      }
    },
  )

  // ── Helper: find similar file paths for suggestions ──
  function findSimilarFiles(root: string, target: string, maxDepth = 4): string[] {
    const basename = target.split('/').pop()?.toLowerCase() ?? ''
    const matches: string[] = []

    function walk(dir: string, depth: number) {
      if (depth > maxDepth || matches.length >= 5) return
      try {
        const entries = readdirSync(dir)
        for (const entry of entries) {
          if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
          const fullPath = join(dir, entry)
          try {
            const stat = statSync(fullPath)
            if (stat.isDirectory()) {
              walk(fullPath, depth + 1)
            } else if (entry.toLowerCase().includes(basename) || basename.includes(entry.toLowerCase())) {
              matches.push(relative(root, fullPath).replace(/\\/g, '/'))
            }
          } catch { continue }
        }
      } catch { /* skip */ }
    }

    walk(root, 0)
    return matches
  }
}
