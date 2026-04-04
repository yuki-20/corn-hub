'use client'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import { getSessions } from '@/lib/api'

function timeAgo(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function duration(start: string, end?: string): string {
  if (!end) return '—'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function SessionsPage() {
  const { data } = useSWR('sessions', () => getSessions(), { refreshInterval: 10000 })
  const sessions = data?.sessions || []
  const active = sessions.filter((s: any) => s.status === 'active').length
  const completed = sessions.filter((s: any) => s.status === 'completed').length

  return (
    <DashboardLayout title="Sessions" subtitle="Agent work sessions and handoffs">
      {/* Summary Stats */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-gold)' }}>{sessions.length}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Sessions</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-blue)' }}>{active}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-green)' }}>{completed}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Completed</div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="table-container animate-in" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Project</th>
              <th>Task</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Files</th>
              <th>Decisions</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length > 0 ? (
              sessions.map((s: any) => {
                const files = (() => { try { return JSON.parse(s.files_changed || '[]') } catch { return [] } })()
                const decisions = (() => { try { return JSON.parse(s.decisions || '[]') } catch { return [] } })()
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.from_agent}</td>
                    <td><code style={{ color: 'var(--corn-gold)', fontSize: '0.8rem' }}>{s.project}</code></td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.task_summary}>
                      {s.task_summary}
                    </td>
                    <td>
                      <span className={`badge badge-${s.status === 'completed' ? 'healthy' : s.status === 'active' ? 'info' : 'warning'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{duration(s.created_at, s.ended_at)}</td>
                    <td>
                      {files.length > 0 ? (
                        <span className="badge badge-info" title={files.join(', ')}>{files.length} files</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {decisions.length > 0 ? (
                        <span className="badge badge-warning" title={decisions.join('\n')}>{decisions.length}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(s.created_at)}</td>
                  </tr>
                )
              })
            ) : (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-muted)' }}>
                📭 No sessions yet. Sessions appear when agents call <code>corn_session_start</code>.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}
