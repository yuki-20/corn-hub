'use client'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import { getQualityReports, getQualityTrends } from '@/lib/api'

function timeAgo(d: string) {
  // SQLite datetime lacks 'Z' suffix — append it to force UTC parsing
  const normalized = d.endsWith('Z') || d.includes('+') ? d : d + 'Z'
  const mins = Math.floor((Date.now() - new Date(normalized).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: 35 }}>{value}/{max}</span>
    </div>
  )
}

export default function QualityPage() {
  const { data } = useSWR('quality', () => getQualityReports(), { refreshInterval: 15000 })
  const { data: trends } = useSWR('quality-trends', getQualityTrends, { refreshInterval: 30000 })

  const reports = data?.reports || []
  const total = reports.length
  const avgScore = total > 0 ? Math.round(reports.reduce((sum: number, r: any) => sum + (r.score_total || 0), 0) / total) : 0
  const passed = reports.filter((r: any) => r.passed === 1).length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0

  return (
    <DashboardLayout title="Quality" subtitle="Quality reports with 4D scoring and grade trends">
      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, background: 'var(--gradient-gold)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {total}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Reports</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-green)' }}>{avgScore}/100</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Avg Score</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: passRate >= 80 ? 'var(--corn-green)' : passRate >= 60 ? 'var(--corn-gold)' : 'var(--corn-red)' }}>
            {passRate}%
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pass Rate</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-teal)' }}>{passed}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Passed</div>
        </div>
      </div>

      {/* Trends */}
      {trends?.trends && trends.trends.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ fontWeight: 600, marginBottom: 'var(--space-4)' }}>📈 Grade Trend (Last 30 Days)</h3>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {trends.trends.map((t: any, i: number) => {
              const height = Math.max(24, Math.round((t.avg_score / 100) * 80))
              const color = t.avg_score >= 80 ? 'var(--gradient-green)' : t.avg_score >= 60 ? 'var(--gradient-gold)' : 'linear-gradient(135deg, #ef4444, #dc2626)'
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: t.avg_score >= 80 ? 'var(--corn-green)' : 'var(--corn-gold)' }}>
                    {Math.round(t.avg_score)}
                  </span>
                  <div style={{ width: 36, height, background: color, borderRadius: 'var(--radius-sm)', transition: 'height 0.3s ease' }} />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t.date?.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Reports Table */}
      <div className="table-container animate-in" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Grade</th>
              <th>Score</th>
              <th>Gate</th>
              <th>Agent</th>
              <th>Build</th>
              <th>Regression</th>
              <th>Standards</th>
              <th>Traceability</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {reports.length > 0 ? (
              reports.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <span className={`grade-${r.grade}`} style={{ fontWeight: 800, fontSize: '1.2rem', textShadow: '0 0 10px rgba(currentColor, 0.4)' }}>
                      {r.grade}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.score_total}/100</td>
                  <td>
                    <code style={{ color: 'var(--corn-gold)', fontSize: '0.8rem', background: 'rgba(251, 191, 36, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                      {r.gate_name}
                    </code>
                  </td>
                  <td>{r.agent_id}</td>
                  <td><ScoreBar value={r.score_build} max={25} color="var(--corn-green)" /></td>
                  <td><ScoreBar value={r.score_regression} max={25} color="var(--corn-blue)" /></td>
                  <td><ScoreBar value={r.score_standards} max={25} color="var(--corn-purple)" /></td>
                  <td><ScoreBar value={r.score_traceability} max={25} color="var(--corn-teal)" /></td>
                  <td>
                    <span className={`badge badge-${r.passed === 1 ? 'healthy' : 'error'}`}>
                      {r.passed === 1 ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(r.created_at)}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-muted)' }}>
                🏆 No quality reports yet. Reports appear when agents call <code>corn_quality_report</code>.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
