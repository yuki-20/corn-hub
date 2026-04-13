import ts from 'typescript'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname, resolve } from 'node:path'
import { dbAll, dbGet, dbRun } from '../db/client.js'
import { generateId, createLogger } from '@corn/shared-utils'

const logger = createLogger('ast-engine')

// ─── Types ──────────────────────────────────────────────

export interface SymbolInfo {
  id: string
  projectId: string
  name: string
  kind: string // 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method' | 'property' | 'enum'
  filePath: string
  startLine: number
  endLine: number
  exported: boolean
  signature: string
  docComment: string
  parentSymbolId: string | null
}

export interface EdgeInfo {
  projectId: string
  sourceSymbolId: string
  targetSymbolId: string
  kind: string // 'calls' | 'imports' | 'extends' | 'implements' | 'references' | 'type_ref'
  filePath: string
  lineNumber: number
}

// ─── AST Engine ─────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.next', '.turbo',
  '.cache', 'coverage', '__pycache__', '.svn',
  'build', 'out', '.output',
])

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

/**
 * Recursively collect all TypeScript/JavaScript files in a directory.
 */
function collectFiles(dir: string, maxFiles = 5000): string[] {
  const files: string[] = []

  function walk(current: string) {
    if (files.length >= maxFiles) return
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return
      if (entry.startsWith('.') && entry !== '.') continue
      if (SKIP_DIRS.has(entry)) continue

      const fullPath = join(current, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          walk(fullPath)
        } else if (stat.isFile() && TS_EXTENSIONS.has(extname(entry).toLowerCase())) {
          // Skip declaration files and very large files
          if (entry.endsWith('.d.ts')) continue
          if (stat.size > 500_000) continue // skip files > 500KB
          files.push(fullPath)
        }
      } catch {
        continue
      }
    }
  }

  walk(dir)
  return files
}

/**
 * Get the kind string for a TypeScript syntax node.
 */
function getSymbolKind(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node)) return 'function'
  if (ts.isClassDeclaration(node)) return 'class'
  if (ts.isInterfaceDeclaration(node)) return 'interface'
  if (ts.isTypeAliasDeclaration(node)) return 'type'
  if (ts.isEnumDeclaration(node)) return 'enum'
  if (ts.isVariableDeclaration(node)) return 'variable'
  if (ts.isMethodDeclaration(node)) return 'method'
  if (ts.isPropertyDeclaration(node)) return 'property'
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return 'function'
  return null
}

/**
 * Check if a node has the `export` keyword.
 */
function isExported(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false
  const modifiers = ts.getModifiers(node)
  return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

/**
 * Extract a signature string from a node.
 */
function getSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  // Get the first line of the node text as signature
  const fullText = node.getText(sourceFile)
  const firstLine = fullText.split('\n')[0] ?? ''
  // Truncate at 200 chars
  return firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine
}

/**
 * Extract JSDoc comment from a node.
 */
function getDocComment(node: ts.Node, sourceFile: ts.SourceFile): string {
  const ranges = ts.getLeadingCommentRanges(sourceFile.getFullText(), node.getFullStart())
  if (!ranges) return ''

  for (const range of ranges) {
    const text = sourceFile.getFullText().slice(range.pos, range.end)
    if (text.startsWith('/**')) {
      return text
        .replace(/^\/\*\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .replace(/^\s*\* ?/gm, '')
        .trim()
    }
  }
  return ''
}

/**
 * Core: Analyze a TypeScript/JavaScript project and populate the graph database.
 */
export async function analyzeProject(
  projectId: string,
  rootDir: string,
  onProgress?: (progress: number, message: string) => void,
): Promise<{ filesAnalyzed: number; symbolsFound: number; edgesFound: number }> {
  logger.info(`Starting AST analysis for project ${projectId} at ${rootDir}`)

  // 1. Collect files
  onProgress?.(5, 'Collecting files...')
  const files = collectFiles(rootDir)
  logger.info(`Found ${files.length} files to analyze`)

  if (files.length === 0) {
    return { filesAnalyzed: 0, symbolsFound: 0, edgesFound: 0 }
  }

  // 2. Clear existing data for this project
  onProgress?.(10, 'Clearing previous analysis...')
  await dbRun('DELETE FROM code_edges WHERE project_id = ?', [projectId])
  await dbRun('DELETE FROM code_symbols WHERE project_id = ?', [projectId])

  // 3. Create TypeScript program
  onProgress?.(15, 'Creating TypeScript program...')
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    checkJs: false,
    noEmit: true,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    // Don't resolve external modules — we only care about project files
    types: [],
  }

  const program = ts.createProgram(files, compilerOptions)
  const checker = program.getTypeChecker()

  // 4. Extract symbols
  const symbolMap = new Map<string, SymbolInfo>() // key: "filePath:name:kind"
  const symbolsByName = new Map<string, SymbolInfo[]>() // name → symbols (for linking)
  let totalSymbols = 0
  let totalEdges = 0

  // Normalize paths for comparison (Windows vs TS path format)
  const normalizedFiles = new Set(files.map(f => f.replace(/\\/g, '/')))
  const sourceFiles = program.getSourceFiles().filter(sf => {
    if (sf.isDeclarationFile) return false
    const normalized = sf.fileName.replace(/\\/g, '/')
    return normalizedFiles.has(normalized)
  })

  logger.info(`TypeScript program returned ${program.getSourceFiles().length} total source files, ${sourceFiles.length} matched project files`)

  for (let fi = 0; fi < sourceFiles.length; fi++) {
    const sourceFile = sourceFiles[fi]
    const relPath = relative(rootDir, sourceFile.fileName).replace(/\\/g, '/')
    const progress = 20 + Math.floor((fi / sourceFiles.length) * 50)
    if (fi % 20 === 0) {
      onProgress?.(progress, `Analyzing ${relPath}... (${fi + 1}/${sourceFiles.length})`)
    }

    // Walk the AST
    const fileSymbols: SymbolInfo[] = []

    function visitNode(node: ts.Node, parentSymbolId: string | null) {
      const kind = getSymbolKind(node)
      if (!kind) {
        ts.forEachChild(node, child => visitNode(child, parentSymbolId))
        return
      }

      let name = ''

      // Get the name of the symbol
      if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ||
          ts.isEnumDeclaration(node) || ts.isMethodDeclaration(node) ||
          ts.isPropertyDeclaration(node)) {
        name = node.name?.getText(sourceFile) ?? '<anonymous>'
      } else if (ts.isVariableDeclaration(node)) {
        name = node.name.getText(sourceFile)
      } else if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        // Try to get name from parent (variable declaration)
        if (ts.isVariableDeclaration(node.parent)) {
          name = node.parent.name.getText(sourceFile)
        } else if (ts.isPropertyAssignment(node.parent)) {
          name = node.parent.name.getText(sourceFile)
        } else {
          name = '<anonymous>'
        }
      }

      if (!name || name === '<anonymous>') {
        // Skip anonymous symbols but still visit children
        ts.forEachChild(node, child => visitNode(child, parentSymbolId))
        return
      }

      const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd())

      const symbolId = generateId('sym')
      const symbol: SymbolInfo = {
        id: symbolId,
        projectId,
        name,
        kind,
        filePath: relPath,
        startLine: startLine + 1,
        endLine: endLine + 1,
        exported: isExported(node) || isExported(node.parent),
        signature: getSignature(node, sourceFile),
        docComment: getDocComment(node, sourceFile),
        parentSymbolId: parentSymbolId,
      }

      const mapKey = `${relPath}:${name}:${kind}`
      symbolMap.set(mapKey, symbol)
      fileSymbols.push(symbol)

      if (!symbolsByName.has(name)) symbolsByName.set(name, [])
      symbolsByName.get(name)!.push(symbol)

      // Visit children with this as parent
      ts.forEachChild(node, child => visitNode(child, symbolId))
    }

    ts.forEachChild(sourceFile, child => visitNode(child, null))

    // Batch insert symbols for this file
    for (const sym of fileSymbols) {
      await dbRun(
        `INSERT INTO code_symbols (id, project_id, name, kind, file_path, start_line, end_line, exported, signature, doc_comment, parent_symbol_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sym.id, sym.projectId, sym.name, sym.kind, sym.filePath, sym.startLine, sym.endLine,
         sym.exported ? 1 : 0, sym.signature, sym.docComment, sym.parentSymbolId],
      )
      totalSymbols++
    }
  }

  // 5. Extract edges (imports, calls, extends/implements)
  onProgress?.(75, 'Building dependency graph...')

  for (let fi = 0; fi < sourceFiles.length; fi++) {
    const sourceFile = sourceFiles[fi]
    const relPath = relative(rootDir, sourceFile.fileName).replace(/\\/g, '/')

    if (fi % 20 === 0) {
      onProgress?.(75 + Math.floor((fi / sourceFiles.length) * 15), `Building edges for ${relPath}...`)
    }

    // Import edges
    for (const stmt of sourceFile.statements) {
      if (ts.isImportDeclaration(stmt)) {
        const moduleSpec = stmt.moduleSpecifier
        if (ts.isStringLiteral(moduleSpec)) {
          const importPath = moduleSpec.text
          // Only track relative imports (project-internal)
          if (importPath.startsWith('.')) {
            const namedBindings = stmt.importClause?.namedBindings
            if (namedBindings && ts.isNamedImports(namedBindings)) {
              for (const element of namedBindings.elements) {
                const importedName = element.name.getText(sourceFile)
                const targets = symbolsByName.get(importedName)
                if (targets && targets.length > 0) {
                  // Find the source symbol (any symbol in this file)
                  const sourceSymbols = Array.from(symbolMap.values())
                    .filter(s => s.filePath === relPath)
                  const sourceSymbol = sourceSymbols[0]

                  if (sourceSymbol) {
                    const { line } = sourceFile.getLineAndCharacterOfPosition(element.getStart(sourceFile))
                    await dbRun(
                      `INSERT INTO code_edges (project_id, source_symbol_id, target_symbol_id, kind, file_path, line_number)
                       VALUES (?, ?, ?, 'imports', ?, ?)`,
                      [projectId, sourceSymbol.id, targets[0].id, relPath, line + 1],
                    )
                    totalEdges++
                  }
                }
              }
            }
          }
        }
      }

      // Class extends/implements
      if (ts.isClassDeclaration(stmt) && stmt.name) {
        const className = stmt.name.getText(sourceFile)
        const classSymbol = symbolMap.get(`${relPath}:${className}:class`)

        if (classSymbol && stmt.heritageClauses) {
          for (const clause of stmt.heritageClauses) {
            const edgeKind = clause.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements'
            for (const typeExpr of clause.types) {
              const baseName = typeExpr.expression.getText(sourceFile)
              const targets = symbolsByName.get(baseName)
              if (targets && targets.length > 0) {
                const { line } = sourceFile.getLineAndCharacterOfPosition(typeExpr.getStart(sourceFile))
                await dbRun(
                  `INSERT INTO code_edges (project_id, source_symbol_id, target_symbol_id, kind, file_path, line_number)
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [projectId, classSymbol.id, targets[0].id, edgeKind, relPath, line + 1],
                )
                totalEdges++
              }
            }
          }
        }
      }
    }

    // Function call edges — walk the full AST looking for call expressions
    function findCalls(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const calledName = node.expression.getText(sourceFile)
        // Simple name (not method calls like obj.method)
        const simpleName = calledName.includes('.') ? calledName.split('.').pop()! : calledName

        const targets = symbolsByName.get(simpleName)
        if (targets && targets.length > 0) {
          // Find which symbol contains this call
          const { line: callLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          const callerSymbols = Array.from(symbolMap.values())
            .filter(s => s.filePath === relPath && s.startLine <= callLine + 1 && s.endLine >= callLine + 1)
          const caller = callerSymbols.pop() // innermost

          if (caller && caller.id !== targets[0].id) {
            dbRun(
              `INSERT INTO code_edges (project_id, source_symbol_id, target_symbol_id, kind, file_path, line_number)
               VALUES (?, ?, ?, 'calls', ?, ?)`,
              [projectId, caller.id, targets[0].id, relPath, callLine + 1],
            ).catch(() => {}) // best effort
            totalEdges++
          }
        }
      }

      ts.forEachChild(node, findCalls)
    }
    findCalls(sourceFile)
  }

  // 6. Update project metadata
  onProgress?.(95, 'Finalizing...')
  await dbRun(
    `UPDATE projects SET indexed_symbols = ?, indexed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    [totalSymbols, projectId],
  )

  logger.info(`Analysis complete: ${sourceFiles.length} files, ${totalSymbols} symbols, ${totalEdges} edges`)
  onProgress?.(100, `Done! ${totalSymbols} symbols, ${totalEdges} edges`)

  return {
    filesAnalyzed: sourceFiles.length,
    symbolsFound: totalSymbols,
    edgesFound: totalEdges,
  }
}

// ─── Query Functions ────────────────────────────────────

/**
 * Search symbols by name pattern.
 */
export async function searchSymbols(
  projectId: string,
  query: string,
  limit = 20,
): Promise<Record<string, unknown>[]> {
  return dbAll(
    `SELECT id, name, kind, file_path, start_line, end_line, exported, signature, doc_comment
     FROM code_symbols
     WHERE project_id = ? AND (name LIKE ? OR file_path LIKE ? OR signature LIKE ?)
     ORDER BY
       CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
       exported DESC, name
     LIMIT ?`,
    [projectId, `%${query}%`, `%${query}%`, `%${query}%`, `${query}%`, limit],
  )
}

/**
 * Get full context for a symbol: definition, callers, callees, related types.
 */
export async function getSymbolContext(
  projectId: string,
  name: string,
  file?: string,
): Promise<{
  symbol: Record<string, unknown> | undefined
  callers: Record<string, unknown>[]
  callees: Record<string, unknown>[]
  importedBy: Record<string, unknown>[]
  extends_: Record<string, unknown>[]
  implementedBy: Record<string, unknown>[]
}> {
  // Find the symbol
  let symbol: Record<string, unknown> | undefined
  if (file) {
    symbol = await dbGet(
      `SELECT * FROM code_symbols WHERE project_id = ? AND name = ? AND file_path LIKE ?`,
      [projectId, name, `%${file}%`],
    )
  }
  if (!symbol) {
    symbol = await dbGet(
      `SELECT * FROM code_symbols WHERE project_id = ? AND name = ? ORDER BY exported DESC`,
      [projectId, name],
    )
  }

  if (!symbol) {
    // Fuzzy search
    const fuzzy = await dbAll(
      `SELECT * FROM code_symbols WHERE project_id = ? AND name LIKE ? ORDER BY exported DESC LIMIT 1`,
      [projectId, `%${name}%`],
    )
    symbol = fuzzy[0]
  }

  if (!symbol) {
    return { symbol: undefined, callers: [], callees: [], importedBy: [], extends_: [], implementedBy: [] }
  }

  const symbolId = symbol.id as string

  // Callers: who calls this symbol?
  const callers = await dbAll(
    `SELECT s.name, s.kind, s.file_path, s.start_line, e.line_number
     FROM code_edges e JOIN code_symbols s ON e.source_symbol_id = s.id
     WHERE e.target_symbol_id = ? AND e.kind = 'calls'
     ORDER BY s.file_path, e.line_number`,
    [symbolId],
  )

  // Callees: what does this symbol call?
  const callees = await dbAll(
    `SELECT s.name, s.kind, s.file_path, s.start_line, e.line_number
     FROM code_edges e JOIN code_symbols s ON e.target_symbol_id = s.id
     WHERE e.source_symbol_id = ? AND e.kind = 'calls'
     ORDER BY e.line_number`,
    [symbolId],
  )

  // Imported by
  const importedBy = await dbAll(
    `SELECT s.name, s.kind, s.file_path, e.line_number
     FROM code_edges e JOIN code_symbols s ON e.source_symbol_id = s.id
     WHERE e.target_symbol_id = ? AND e.kind = 'imports'`,
    [symbolId],
  )

  // Extends
  const extends_ = await dbAll(
    `SELECT s.name, s.kind, s.file_path
     FROM code_edges e JOIN code_symbols s ON e.target_symbol_id = s.id
     WHERE e.source_symbol_id = ? AND e.kind IN ('extends', 'implements')`,
    [symbolId],
  )

  // Implemented by (reverse)
  const implementedBy = await dbAll(
    `SELECT s.name, s.kind, s.file_path
     FROM code_edges e JOIN code_symbols s ON e.source_symbol_id = s.id
     WHERE e.target_symbol_id = ? AND e.kind IN ('extends', 'implements')`,
    [symbolId],
  )

  return { symbol, callers, callees, importedBy, extends_, implementedBy }
}

/**
 * Get downstream/upstream impact of a symbol.
 */
export async function getSymbolImpact(
  projectId: string,
  target: string,
  direction: 'downstream' | 'upstream' = 'downstream',
  maxDepth = 5,
): Promise<{
  targetSymbol: Record<string, unknown> | undefined
  impact: Record<string, unknown>[]
  depth: number
  totalAffected: number
}> {
  // Find the target symbol
  let targetSymbol = await dbGet(
    `SELECT * FROM code_symbols WHERE project_id = ? AND name = ? ORDER BY exported DESC`,
    [projectId, target],
  )
  if (!targetSymbol) {
    targetSymbol = await dbGet(
      `SELECT * FROM code_symbols WHERE project_id = ? AND name LIKE ? ORDER BY exported DESC`,
      [projectId, `%${target}%`],
    )
  }

  if (!targetSymbol) {
    // If target looks like a file path, find all symbols in that file
    if (target.includes('/') || target.includes('.')) {
      const fileSymbols = await dbAll(
        `SELECT * FROM code_symbols WHERE project_id = ? AND file_path LIKE ? ORDER BY start_line`,
        [projectId, `%${target}%`],
      )
      return {
        targetSymbol: { name: target, kind: 'file', file_path: target },
        impact: fileSymbols,
        depth: 0,
        totalAffected: fileSymbols.length,
      }
    }
    return { targetSymbol: undefined, impact: [], depth: 0, totalAffected: 0 }
  }

  const symbolId = targetSymbol.id as string

  // Use recursive CTE to find transitive dependencies
  const edgeDirection = direction === 'downstream'
    ? 'e.target_symbol_id = r.symbol_id'  // who depends on target
    : 'e.source_symbol_id = r.symbol_id'  // what target depends on
  const joinCol = direction === 'downstream' ? 'source_symbol_id' : 'target_symbol_id'

  const impact = await dbAll(
    `WITH RECURSIVE reachable(symbol_id, depth) AS (
       SELECT ?, 0
       UNION
       SELECT e.${joinCol}, r.depth + 1
       FROM code_edges e
       JOIN reachable r ON ${edgeDirection}
       WHERE r.depth < ? AND e.kind IN ('calls', 'imports', 'extends', 'implements')
     )
     SELECT DISTINCT s.name, s.kind, s.file_path, s.start_line, s.exported, r.depth
     FROM reachable r
     JOIN code_symbols s ON s.id = r.symbol_id
     WHERE r.depth > 0
     ORDER BY r.depth, s.file_path, s.name`,
    [symbolId, maxDepth],
  )

  return {
    targetSymbol,
    impact,
    depth: impact.length > 0 ? Math.max(...impact.map(i => i.depth as number)) : 0,
    totalAffected: impact.length,
  }
}

/**
 * Translate a basic Cypher-like query to SQL and execute.
 */
export async function executeCypher(
  projectId: string,
  cypherQuery: string,
): Promise<Record<string, unknown>[]> {
  const query = cypherQuery.trim()

  // Parse common Cypher patterns:

  // Pattern 1: MATCH (n) WHERE n.name CONTAINS "X" RETURN n.name, labels(n) LIMIT N
  const containsMatch = query.match(
    /MATCH\s+\((\w+)\)\s+WHERE\s+\w+\.name\s+CONTAINS\s+"([^"]+)"\s+RETURN\s+.*?(?:LIMIT\s+(\d+))?$/i,
  )
  if (containsMatch) {
    const [, , searchTerm, limitStr] = containsMatch
    const limit = parseInt(limitStr ?? '20')
    return dbAll(
      `SELECT name, kind AS label, file_path, start_line, end_line, exported, signature
       FROM code_symbols WHERE project_id = ? AND name LIKE ?
       ORDER BY exported DESC, name LIMIT ?`,
      [projectId, `%${searchTerm}%`, limit],
    )
  }

  // Pattern 2: MATCH (a)-[:CALLS]->(b) WHERE a.name = "X" RETURN b
  const callsMatch = query.match(
    /MATCH\s+\(\w+\)-\[:(\w+)\]->\(\w+\)\s+WHERE\s+\w+\.name\s*=\s*"([^"]+)"\s+RETURN/i,
  )
  if (callsMatch) {
    const [, edgeKind, symbolName] = callsMatch
    const kind = edgeKind!.toLowerCase()
    return dbAll(
      `SELECT t.name, t.kind, t.file_path, t.start_line, e.line_number
       FROM code_edges e
       JOIN code_symbols s ON e.source_symbol_id = s.id
       JOIN code_symbols t ON e.target_symbol_id = t.id
       WHERE s.project_id = ? AND s.name = ? AND e.kind = ?
       ORDER BY t.file_path`,
      [projectId, symbolName, kind],
    )
  }

  // Pattern 3: MATCH (n:CLASS) RETURN n  OR  MATCH (n:function) RETURN n
  const kindMatch = query.match(
    /MATCH\s+\(\w+:(\w+)\)\s+(?:WHERE\s+.*?\s+)?RETURN\s+.*?(?:LIMIT\s+(\d+))?$/i,
  )
  if (kindMatch) {
    const [, kind, limitStr] = kindMatch
    const limit = parseInt(limitStr ?? '20')
    return dbAll(
      `SELECT name, kind, file_path, start_line, end_line, exported, signature
       FROM code_symbols WHERE project_id = ? AND kind = ?
       ORDER BY name LIMIT ?`,
      [projectId, kind!.toLowerCase(), limit],
    )
  }

  // Pattern 4: MATCH (n) RETURN n LIMIT N  (return all symbols)
  const allMatch = query.match(/MATCH\s+\(\w+\)\s+RETURN\s+.*?(?:LIMIT\s+(\d+))?$/i)
  if (allMatch) {
    const limit = parseInt(allMatch[1] ?? '20')
    return dbAll(
      `SELECT name, kind, file_path, start_line, exported
       FROM code_symbols WHERE project_id = ?
       ORDER BY file_path, start_line LIMIT ?`,
      [projectId, limit],
    )
  }

  // Fallback: try a general search with extracted terms
  const terms = query.match(/"([^"]+)"/g)?.map(t => t.replace(/"/g, '')) ?? []
  if (terms.length > 0) {
    const conditions = terms.map(() => 'name LIKE ?').join(' OR ')
    const params = terms.map(t => `%${t}%`)
    return dbAll(
      `SELECT name, kind, file_path, start_line, exported, signature
       FROM code_symbols WHERE project_id = ? AND (${conditions})
       ORDER BY name LIMIT 20`,
      [projectId, ...params],
    )
  }

  return [{ error: 'Could not parse Cypher query. Use patterns like: MATCH (n) WHERE n.name CONTAINS "X" RETURN n' }]
}

/**
 * Get project statistics.
 */
export async function getProjectStats(
  projectId: string,
): Promise<{
  totalSymbols: number
  totalEdges: number
  byKind: Record<string, number>
  topFiles: { file: string; count: number }[]
}> {
  const totalSymbolsRow = await dbGet(
    `SELECT COUNT(*) as count FROM code_symbols WHERE project_id = ?`,
    [projectId],
  )
  const totalEdgesRow = await dbGet(
    `SELECT COUNT(*) as count FROM code_edges WHERE project_id = ?`,
    [projectId],
  )

  const kindRows = await dbAll(
    `SELECT kind, COUNT(*) as count FROM code_symbols WHERE project_id = ? GROUP BY kind ORDER BY count DESC`,
    [projectId],
  )

  const topFileRows = await dbAll(
    `SELECT file_path, COUNT(*) as count FROM code_symbols WHERE project_id = ? GROUP BY file_path ORDER BY count DESC LIMIT 10`,
    [projectId],
  )

  const byKind: Record<string, number> = {}
  for (const row of kindRows) {
    byKind[row.kind as string] = row.count as number
  }

  return {
    totalSymbols: (totalSymbolsRow?.count as number) ?? 0,
    totalEdges: (totalEdgesRow?.count as number) ?? 0,
    byKind,
    topFiles: topFileRows.map(r => ({ file: r.file_path as string, count: r.count as number })),
  }
}
