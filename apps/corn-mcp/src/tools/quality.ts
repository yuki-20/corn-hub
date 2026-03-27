import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpEnv } from '@corn/shared-types'
import { generateId } from '@corn/shared-utils'

/** Build a visual bar: ████████░░ (filled vs empty blocks, max width) */
function scoreBar(score: number, max: number, width = 10): string {
  const filled = Math.round((score / max) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** Map a 0-100 total to a letter grade + emoji */
function gradeInfo(total: number): { grade: string; emoji: string; label: string } {
  if (total >= 90) return { grade: 'A', emoji: '🏆', label: 'Excellent' }
  if (total >= 75) return { grade: 'B', emoji: '✅', label: 'Good' }
  if (total >= 60) return { grade: 'C', emoji: '⚠️', label: 'Acceptable' }
  if (total >= 40) return { grade: 'D', emoji: '🟡', label: 'Needs Work' }
  return { grade: 'F', emoji: '❌', label: 'Failing' }
}

export function registerQualityTools(server: McpServer, env: McpEnv) {
  // ─── Quality Report ──────────────────────────────────
  server.tool(
    'corn_quality_report',
    'Submit a quality report with 4-dimension scoring (Build, Regression, Standards, Traceability). Each dimension is 0-25, total 0-100.',
    {
      projectId: z.string().optional().describe('Project ID'),
      sessionId: z.string().optional().describe('Session ID'),
      gateName: z.string().describe('Quality gate name (e.g., "pre-commit", "post-task")'),
      scoreBuild: z.number().min(0).max(25).describe('Build quality (0-25)'),
      scoreRegression: z.number().min(0).max(25).describe('Regression check (0-25)'),
      scoreStandards: z.number().min(0).max(25).describe('Standards compliance (0-25)'),
      scoreTraceability: z.number().min(0).max(25).describe('Change traceability (0-25)'),
      details: z.string().optional().describe('Additional details as JSON'),
    },
    async ({ projectId, sessionId, gateName, scoreBuild, scoreRegression, scoreStandards, scoreTraceability, details }) => {
      const agentId = (env as McpEnv & { API_KEY_OWNER?: string }).API_KEY_OWNER || 'unknown'
      const reportId = generateId('qr')
      const total = scoreBuild + scoreRegression + scoreStandards + scoreTraceability
      const { grade, emoji, label } = gradeInfo(total)
      const passed = total >= 60

      // Submit to Dashboard API
      try {
        const apiUrl = (env.DASHBOARD_API_URL || 'http://localhost:4000').replace(/\/$/, '')
        await fetch(`${apiUrl}/api/quality`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: reportId,
            projectId,
            agentId,
            sessionId,
            gateName,
            scoreBuild,
            scoreRegression,
            scoreStandards,
            scoreTraceability,
            scoreTotal: total,
            grade,
            passed,
            details: details ? JSON.parse(details) : null,
          }),
          signal: AbortSignal.timeout(5000),
        })
      } catch {
        // Best effort
      }

      // ── Build rich table output ──
      const dimensions = [
        { name: 'Build Quality', score: scoreBuild },
        { name: 'Regression Check', score: scoreRegression },
        { name: 'Standards Compliance', score: scoreStandards },
        { name: 'Change Traceability', score: scoreTraceability },
      ]

      const lines: string[] = []

      lines.push(`## ${emoji} Quality Report — Grade ${grade} (${label})`)
      lines.push('')
      lines.push(`| Gate | Total Score | Grade | Status |`)
      lines.push(`|:-----|:----------:|:-----:|:------:|`)
      lines.push(`| ${gateName} | **${total}/100** | **${grade}** | ${passed ? '✅ PASSED' : '❌ FAILED'} |`)
      lines.push('')
      lines.push(`### Score Breakdown`)
      lines.push('')
      lines.push(`| Dimension | Score | Bar | Rating |`)
      lines.push(`|:----------|------:|:----|:------:|`)
      for (const d of dimensions) {
        const pct = Math.round((d.score / 25) * 100)
        const rating = pct >= 80 ? '🟢' : pct >= 60 ? '🟡' : '🔴'
        lines.push(`| ${d.name} | **${d.score}**/25 | \`${scoreBar(d.score, 25)}\` | ${rating} ${pct}% |`)
      }
      lines.push('')
      lines.push(`> **Report ID:** \`${reportId}\` · **Agent:** \`${agentId}\`${projectId ? ` · **Project:** \`${projectId}\`` : ''}`)

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      }
    },
  )

  // ─── Plan Quality ────────────────────────────────────
  server.tool(
    'corn_plan_quality',
    'Assess the quality of a plan before execution. Scores against 8 criteria: clarity, scope, risks, testing, reversibility, impact, dependencies, timeline.',
    {
      plan: z.string().describe('The plan text to assess'),
      projectId: z.string().optional().describe('Project context'),
    },
    async ({ plan, projectId }) => {
      // Simple heuristic scoring — in production, send to LLM for analysis
      const criteria = [
        { name: 'Clarity', icon: '📝', check: plan.length > 50, hint: 'Plan should be detailed (>50 chars)' },
        { name: 'Scope', icon: '🎯', check: plan.includes('file') || plan.includes('change'), hint: 'Mention files or changes' },
        { name: 'Risks', icon: '⚡', check: plan.toLowerCase().includes('risk') || plan.toLowerCase().includes('backup'), hint: 'Address risks or backups' },
        { name: 'Testing', icon: '🧪', check: plan.toLowerCase().includes('test') || plan.toLowerCase().includes('verify'), hint: 'Include test/verify steps' },
        { name: 'Reversibility', icon: '↩️', check: plan.toLowerCase().includes('revert') || plan.toLowerCase().includes('rollback'), hint: 'Mention rollback strategy' },
        { name: 'Impact', icon: '💥', check: plan.toLowerCase().includes('impact') || plan.toLowerCase().includes('affect'), hint: 'Describe downstream impact' },
        { name: 'Dependencies', icon: '🔗', check: plan.toLowerCase().includes('depend') || plan.toLowerCase().includes('require'), hint: 'List dependencies' },
        { name: 'Timeline', icon: '📅', check: plan.toLowerCase().includes('step') || plan.toLowerCase().includes('phase'), hint: 'Define steps or phases' },
      ]

      const scored = criteria.map((c) => ({
        ...c,
        score: c.check ? 10 : 3,
      }))

      const total = scored.reduce((sum, c) => sum + c.score, 0)
      const maxScore = criteria.length * 10
      const percentage = Math.round((total / maxScore) * 100)
      const passed = scored.filter((c) => c.score >= 7).length
      const failed = scored.length - passed
      const { grade, emoji, label } = gradeInfo(percentage)

      const lines: string[] = []

      lines.push(`## 📋 Plan Quality Assessment — Grade ${grade}`)
      lines.push('')
      lines.push(`| Overall Score | Grade | Criteria Passed | Status |`)
      lines.push(`|:------------:|:-----:|:---------------:|:------:|`)
      lines.push(`| **${percentage}%** (${total}/${maxScore}) | ${emoji} **${grade}** — ${label} | ${passed}/${scored.length} | ${percentage >= 60 ? '✅ Ready' : '⚠️ Needs Improvement'} |`)
      lines.push('')
      lines.push(`### Criteria Breakdown`)
      lines.push('')
      lines.push(`| # | Criteria | Score | Bar | Status | Hint |`)
      lines.push(`|:-:|:---------|------:|:----|:------:|:-----|`)
      scored.forEach((c, i) => {
        const status = c.score >= 7 ? '✅ Pass' : '⚠️ Weak'
        lines.push(`| ${i + 1} | ${c.icon} ${c.name} | **${c.score}**/10 | \`${scoreBar(c.score, 10, 8)}\` | ${status} | ${c.score >= 7 ? '—' : c.hint} |`)
      })
      lines.push('')

      if (failed > 0) {
        const weakAreas = scored.filter((c) => c.score < 7).map((c) => `${c.icon} **${c.name}**: ${c.hint}`)
        lines.push(`### ⚠️ Areas to Improve`)
        lines.push('')
        for (const w of weakAreas) {
          lines.push(`- ${w}`)
        }
        lines.push('')
      }

      lines.push(`> ${percentage >= 60 ? '✅ Plan meets quality threshold — safe to proceed.' : '⚠️ Plan is below quality threshold (60%). Consider addressing weak areas before execution.'}`)

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      }
    },
  )
}
