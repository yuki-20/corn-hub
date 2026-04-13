'use client'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import { getToolAnalytics } from '@/lib/api'

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`
  return `${n} B`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export default function UsagePage() {
  const { data } = useSWR('tool-analytics', () => getToolAnalytics(30), { refreshInterval: 15000 })

  const summary = data?.summary
  // Estimation: each tool call saves ~500 tokens on average (context retrieval replaces manual search)
  const EST_TOKENS_PER_CALL = 500
  const estimatedSavings = (summary?.totalCalls ?? 0) * EST_TOKENS_PER_CALL
  // At ~$0.15/1M tokens (GPT-4 class), estimate cost savings
  const estimatedCostSaved = (estimatedSavings / 1_000_000) * 0.15

  return (
    <DashboardLayout title="Usage" subtitle="Tool analytics, call volume, token savings, and performance tracking">
      {/* Top Stats */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 160, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, background: 'var(--gradient-gold)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {summary?.totalCalls ?? '...'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Calls (30d)</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 160, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-green)' }}>
            {summary ? `${summary.overallSuccessRate}%` : '...'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Success Rate</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 160, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-blue)' }}>
            {summary?.activeAgents ?? '...'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Agents</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 160, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-teal)' }}>
            {summary ? formatBytes(summary.totalDataBytes) : '...'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Data Transferred</div>
        </div>
      </div>

      {/* Token Savings Estimation */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.06) 0%, rgba(34, 197, 94, 0.03) 100%)', borderColor: 'rgba(251, 191, 36, 0.15)' }}>
        <h3 style={{ fontWeight: 600, marginBottom: 'var(--space-4)' }}>💎 Estimated Token Savings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, background: 'var(--gradient-gold)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {formatNumber(estimatedSavings)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Est. Tokens Saved</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--corn-green)' }}>
              ${estimatedCostSaved.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Est. Cost Saved</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--corn-teal)' }}>
              {summary?.estimatedTokensSaved ? formatNumber(summary.estimatedTokensSaved) : '0'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Compute Tokens</div>
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: 'var(--space-3)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
          📐 <strong>Method:</strong> Each MCP tool call eliminates an estimated ~{EST_TOKENS_PER_CALL} tokens of context-gathering, search, and retrieval that agents would otherwise spend. Cost estimate based on $0.15/1M tokens (GPT-4 class pricing).
        </div>
      </div>

      {/* Per-Tool Breakdown */}
      <div className="table-container animate-in" style={{ marginBottom: 'var(--space-6)', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', background: 'linear-gradient(90deg, rgba(251, 191, 36, 0.05) 0%, transparent 100%)' }}>
          <h3 style={{ fontWeight: 600, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>🔧 Tool Performance</h3>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Calls</th>
              <th>Success %</th>
              <th>Errors</th>
              <th>Avg Latency</th>
              <th>Est. Tokens Saved</th>
            </tr>
          </thead>
          <tbody>
            {data?.tools && data.tools.length > 0 ? (
              data.tools.map((t, i) => (
                <tr key={i}>
                  <td>
                    <span style={{ marginRight: 8 }}>{t.errorCount === 0 ? '✅' : '⚠️'}</span>
                    <code style={{ color: 'var(--corn-gold)', fontSize: '0.85rem', background: 'rgba(251, 191, 36, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>{t.tool}</code>
                  </td>
                  <td style={{ fontWeight: 600 }}>{t.totalCalls}</td>
                  <td>
                    <span style={{
                      color: t.successRate >= 90 ? 'var(--corn-green)' : t.successRate >= 70 ? 'var(--corn-gold)' : '#ef4444',
                      fontWeight: 600,
                    }}>{t.successRate}%</span>
                  </td>
                  <td style={{ color: t.errorCount > 0 ? '#ef4444' : 'var(--text-muted)' }}>{t.errorCount}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{t.avgLatencyMs}ms</td>
                  <td style={{ color: 'var(--corn-teal)', fontWeight: 600 }}>~{formatNumber(t.totalCalls * EST_TOKENS_PER_CALL)}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                No tool calls recorded yet. Use Corn MCP tools from your IDE to see analytics here.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Per-Agent Breakdown */}
      <div className="table-container animate-in" style={{ marginBottom: 'var(--space-6)', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', background: 'linear-gradient(90deg, rgba(34, 197, 94, 0.05) 0%, transparent 100%)' }}>
          <h3 style={{ fontWeight: 600, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>🤖 Agent Activity</h3>
        </div>
        <table className="table">
          <thead>
            <tr><th>Agent</th><th>Total Calls</th><th>Success Rate</th><th>Est. Tokens</th></tr>
          </thead>
          <tbody>
            {data?.agents && data.agents.length > 0 ? (
              data.agents.map((a, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.agentId}</td>
                  <td style={{ fontWeight: 600, color: 'var(--corn-teal)' }}>{a.totalCalls}</td>
                  <td>
                    <span style={{ color: 'var(--corn-green)', fontWeight: 600 }}>{a.successRate}%</span>
                  </td>
                  <td style={{ color: 'var(--corn-gold)', fontWeight: 600 }}>~{formatNumber(a.totalCalls * EST_TOKENS_PER_CALL)}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                No agent activity yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Daily Trend */}
      {data?.trend && data.trend.length > 0 && (
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: 'var(--space-4)' }}>📅 Daily Call Volume</h3>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {data.trend.slice().reverse().map((d, i) => {
              const maxCalls = Math.max(...data.trend.map(x => x.calls), 1)
              const height = Math.max(20, Math.round((d.calls / maxCalls) * 100))
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--corn-gold)' }}>{d.calls}</span>
                  <div style={{
                    width: 36,
                    height,
                    background: d.errors > 0 ? 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)' : 'var(--gradient-gold)',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'height 0.3s ease',
                    position: 'relative',
                  }}>
                    {d.errors > 0 && (
                      <span style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: '0.6rem', color: '#ef4444' }}>
                        {d.errors}err
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{d.day.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
