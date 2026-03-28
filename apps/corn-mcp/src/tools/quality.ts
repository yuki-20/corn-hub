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

      // Identify weak dimensions (below 60%)
      const weakDimensions = dimensions.filter(d => Math.round((d.score / 25) * 100) < 60)

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

      // ── QUALITY GATE ENFORCEMENT ──
      if (!passed) {
        lines.push('')
        lines.push(`---`)
        lines.push(`## 🚫 QUALITY GATE FAILED — DO NOT PROCEED`)
        lines.push('')
        lines.push(`**Score ${total}/100 is below the required threshold of 60/100.**`)
        lines.push('')
        if (weakDimensions.length > 0) {
          lines.push(`### Failing Dimensions:`)
          for (const d of weakDimensions) {
            lines.push(`- ❌ **${d.name}**: ${d.score}/25 (${Math.round((d.score / 25) * 100)}%)`)
          }
          lines.push('')
        }
        lines.push(`**MANDATORY:** You MUST stop, fix the failing dimensions above, and resubmit this quality report before continuing with any further work. Do NOT commit, push, or deploy until this gate passes.`)
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        isError: !passed,
      }
    },
  )

  // ─── Plan Quality ────────────────────────────────────
  const PLAN_QUALITY_THRESHOLD = 80

  server.tool(
    'corn_plan_quality',
    'Assess the quality of a plan before execution. Scores against 8 criteria: clarity, scope, risks, testing, reversibility, impact, dependencies, timeline. Plans MUST score ≥80% to proceed.',
    {
      plan: z.string().describe('The plan text to assess'),
      projectId: z.string().optional().describe('Project context'),
    },
    async ({ plan, projectId }) => {
      // Simple heuristic scoring — in production, send to LLM for analysis
      const criteria = [
        { name: 'Clarity', icon: '📝', check: plan.length > 50, hint: 'Plan should be detailed (>50 chars)' },
        { name: 'Scope', icon: '🎯', check: plan.includes('file') || plan.includes('change'), hint: 'Mention specific files or changes to make' },
        { name: 'Risks', icon: '⚡', check: plan.toLowerCase().includes('risk') || plan.toLowerCase().includes('backup'), hint: 'Address potential risks or backup strategy' },
        { name: 'Testing', icon: '🧪', check: plan.toLowerCase().includes('test') || plan.toLowerCase().includes('verify'), hint: 'Include test/verification steps' },
        { name: 'Reversibility', icon: '↩️', check: plan.toLowerCase().includes('revert') || plan.toLowerCase().includes('rollback'), hint: 'Describe rollback strategy if something goes wrong' },
        { name: 'Impact', icon: '💥', check: plan.toLowerCase().includes('impact') || plan.toLowerCase().includes('affect'), hint: 'Describe what downstream systems or users are affected' },
        { name: 'Dependencies', icon: '🔗', check: plan.toLowerCase().includes('depend') || plan.toLowerCase().includes('require'), hint: 'List what this plan depends on or requires' },
        { name: 'Timeline', icon: '📅', check: plan.toLowerCase().includes('step') || plan.toLowerCase().includes('phase'), hint: 'Break into numbered steps or phases' },
      ]

      const scored = criteria.map((c) => ({
        ...c,
        score: c.check ? 10 : 3,
      }))

      const total = scored.reduce((sum, c) => sum + c.score, 0)
      const maxScore = criteria.length * 10
      const percentage = Math.round((total / maxScore) * 100)
      const passedCount = scored.filter((c) => c.score >= 7).length
      const failedCriteria = scored.filter((c) => c.score < 7)
      const meetsThreshold = percentage >= PLAN_QUALITY_THRESHOLD
      const { grade, emoji, label } = gradeInfo(percentage)

      const lines: string[] = []

      lines.push(`## 📋 Plan Quality Assessment — Grade ${grade}`)
      lines.push('')
      lines.push(`| Overall Score | Grade | Criteria Passed | Threshold | Status |`)
      lines.push(`|:------------:|:-----:|:---------------:|:---------:|:------:|`)
      lines.push(`| **${percentage}%** (${total}/${maxScore}) | ${emoji} **${grade}** — ${label} | ${passedCount}/${scored.length} | ${PLAN_QUALITY_THRESHOLD}% | ${meetsThreshold ? '✅ APPROVED' : '🚫 REJECTED'} |`)
      lines.push('')
      lines.push(`### Criteria Breakdown`)
      lines.push('')
      lines.push(`| # | Criteria | Score | Bar | Status | Hint |`)
      lines.push(`|:-:|:---------|------:|:----|:------:|:-----|`)
      scored.forEach((c, i) => {
        const status = c.score >= 7 ? '✅ Pass' : '❌ Fail'
        lines.push(`| ${i + 1} | ${c.icon} ${c.name} | **${c.score}**/10 | \`${scoreBar(c.score, 10, 8)}\` | ${status} | ${c.score >= 7 ? '—' : c.hint} |`)
      })
      lines.push('')

      if (!meetsThreshold) {
        // ── HARD ENFORCEMENT: PLAN REJECTED ──
        lines.push(`---`)
        lines.push(`## 🚫 PLAN REJECTED — SCORE ${percentage}% IS BELOW ${PLAN_QUALITY_THRESHOLD}% THRESHOLD`)
        lines.push('')
        lines.push(`**Your plan failed ${failedCriteria.length} criteria. You MUST revise it before executing.**`)
        lines.push('')
        lines.push(`### ❌ Missing from your plan:`)
        lines.push('')
        for (const c of failedCriteria) {
          lines.push(`${c.icon} **${c.name}** — ${c.hint}`)
        }
        lines.push('')
        lines.push(`### 📝 Required Action:`)
        lines.push(`1. **STOP** — Do NOT execute this plan`)
        lines.push(`2. **REVISE** — Rewrite your plan addressing every ❌ criteria above`)
        lines.push(`3. **RESUBMIT** — Call \`corn_plan_quality\` again with the improved plan`)
        lines.push(`4. **ONLY proceed** when the score is ≥${PLAN_QUALITY_THRESHOLD}%`)
        lines.push('')
        lines.push(`> 🛑 **This is a mandatory quality gate. Executing a rejected plan violates project quality standards.**`)
      } else {
        lines.push(`> ✅ **Plan approved** — meets the ${PLAN_QUALITY_THRESHOLD}% quality threshold. Safe to proceed with execution.`)
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        isError: !meetsThreshold,
      }
    },
  )
}
