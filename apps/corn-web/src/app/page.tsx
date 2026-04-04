'use client'

import Link from 'next/link'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import { checkHealth, getDashboardOverview, getActivityFeed, type ActivityEvent, type TopToolStat } from '@/lib/api'
import styles from './page.module.css'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`
  return `${n} B`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatUptime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hrs > 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

function toolIcon(toolName: string): string {
  if (toolName.includes('session')) return '🔄'
  if (toolName.includes('memory')) return '🧠'
  if (toolName.includes('knowledge')) return '📚'
  if (toolName.includes('quality') || toolName.includes('plan')) return '🏆'
  if (toolName.includes('code')) return '💻'
  if (toolName.includes('health')) return '💚'
  if (toolName.includes('tool_stats')) return '📊'
  if (toolName.includes('change') || toolName.includes('detect')) return '🔍'
  if (toolName.includes('cypher')) return '🔗'
  if (toolName.includes('index')) return '🧬'
  return '🔧'
}

function StatPill({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className={styles.statPill}>
      <span className={styles.statIcon}>{icon}</span>
      <div className={styles.statContent}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
    </div>
  )
}

function ServiceDot({ name, status }: { name: string; status: string }) {
  const cls = status === 'ok' ? 'healthy' : status === 'error' ? 'error' : 'warning'
  return (
    <div className={styles.serviceDot}>
      <span className={`status-dot ${cls}`} />
      <span className={styles.serviceName}>{name}</span>
    </div>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={styles.progressTrack}>
      <div className={styles.progressFill} style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function DashboardPage() {
  const { data: health, isLoading, mutate } = useSWR('health', checkHealth, { refreshInterval: 30000 })
  const { data: overview } = useSWR('overview', getDashboardOverview, { refreshInterval: 15000 })
  const { data: activityData } = useSWR('activity', () => getActivityFeed(15), { refreshInterval: 15000 })

  const svcMap = health?.services as Record<string, string> | undefined
  const savings = overview?.tokenSavings
  const maxCalls = savings?.topTools?.length ? Math.max(...savings.topTools.map(t => t.calls)) : 1

  return (
    <DashboardLayout title="Dashboard" subtitle="System overview and project health">
      {/* Hero Stats */}
      <div className={styles.heroBar}>
        <StatPill icon="📁" value={overview ? String(overview.projects.length) : '...'} label="Projects" />
        <StatPill icon="🧠" value={overview ? formatNumber(overview.indexedSymbols) : '...'} label="Symbols" />
        <StatPill icon="🤖" value={overview ? formatNumber(overview.totalAgents) : '...'} label="Agents" />
        <StatPill icon="📊" value={overview ? formatNumber(overview.today.queries) : '...'} label="Queries Today" />
        <StatPill icon="🔧" value={overview ? formatNumber(savings?.totalToolCalls ?? 0) : '...'} label="Tool Calls" />
        <StatPill icon="🏆" value={overview?.quality.lastGrade ?? '...'} label="Quality" />
        <StatPill icon="⚡" value={overview ? formatUptime(overview.uptime) : '...'} label="Uptime" />
      </div>

      {/* Services Strip */}
      <div className={styles.servicesStrip}>
        <div className={styles.servicesLeft}>
          <h3 className={styles.stripTitle}>Services</h3>
          <div className={styles.servicesRow}>
            {['sqlite', 'api', 'mcp'].map((svc) => (
              <ServiceDot key={svc} name={svc} status={svcMap?.[svc] ?? (isLoading ? 'loading' : 'unknown')} />
            ))}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => mutate()} disabled={isLoading}>
          {isLoading ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      {/* ── Token Savings + Top Tools ─────────────────────── */}
      <section style={{ marginBottom: 'var(--space-6)' }}>
        <h2 className={styles.sectionTitle}>💎 Token Savings & Tool Intelligence</h2>
        <div className={styles.savingsGrid}>
          {/* Token Savings Summary */}
          <div className={`card ${styles.savingsCard}`}>
            <div className={styles.savingsHeader}>
              <span className={styles.savingsIcon}>💎</span>
              <span className={styles.savingsTitle}>Tokens Saved</span>
            </div>
            <div className={styles.savingsBigNumber}>
              {overview ? formatNumber(savings?.totalTokensSaved ?? 0) : '...'}
            </div>
            <div className={styles.savingsSubtext}>via {formatNumber(savings?.totalToolCalls ?? 0)} tool calls</div>
            <div className={styles.savingsMetrics}>
              <div className={styles.savingsMetric}>
                <span className={styles.savingsMetricValue}>{savings?.avgTokensPerCall ?? 0}</span>
                <span className={styles.savingsMetricLabel}>Avg / Call</span>
              </div>
              <div className={styles.savingsMetric}>
                <span className={styles.savingsMetricValue}>{savings?.avgLatencyMs ?? 0}ms</span>
                <span className={styles.savingsMetricLabel}>Avg Latency</span>
              </div>
              <div className={styles.savingsMetric}>
                <span className={styles.savingsMetricValue}>{formatBytes(savings?.totalDataBytes ?? 0)}</span>
                <span className={styles.savingsMetricLabel}>Data Transfer</span>
              </div>
            </div>
          </div>

          {/* Top Tools Mini-Table */}
          <div className={`card ${styles.topToolsCard}`}>
            <div className={styles.topToolsHeader}>
              <span>🔧 Top Tools</span>
              <Link href="/usage" className={styles.intelLink}>Details →</Link>
            </div>
            {savings?.topTools && savings.topTools.length > 0 ? (
              <div className={styles.topToolsList}>
                {savings.topTools.slice(0, 6).map((t: TopToolStat, i: number) => (
                  <div key={i} className={styles.topToolRow}>
                    <span className={styles.topToolIcon}>{toolIcon(t.tool)}</span>
                    <div className={styles.topToolInfo}>
                      <span className={styles.topToolName}>{t.tool.replace('corn_', '')}</span>
                      <ProgressBar value={t.calls} max={maxCalls} color="var(--corn-gold)" />
                    </div>
                    <div className={styles.topToolStats}>
                      <span className={styles.topToolCalls}>{t.calls}</span>
                      <span className={styles.topToolLatency}>{t.avgLatencyMs}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState} style={{ padding: 'var(--space-6)' }}>
                <span style={{ fontSize: '1.4rem' }}>🔧</span>
                <p>No tool calls yet</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Two Column Layout */}
      <div className={styles.twoCol}>
        {/* Left: Intelligence */}
        <section>
          <h2 className={styles.sectionTitle}>Intelligence</h2>
          <div className={`card ${styles.intelCard}`}>
            <div className={styles.intelHeader}>
              <span>🏆 Quality Gates</span>
              <Link href="/quality" className={styles.intelLink}>View →</Link>
            </div>
            <div className={styles.intelGrid}>
              <div className={styles.intelStat}>
                <span className={`${styles.intelValue} grade-${overview?.quality.lastGrade || 'F'}`}>
                  {overview?.quality.lastGrade ?? '—'}
                </span>
                <span className={styles.intelLabel}>Last Grade</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>{overview?.quality.averageScore ?? '—'}</span>
                <span className={styles.intelLabel}>Avg Score</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>{overview?.quality.passRate ?? 0}%</span>
                <span className={styles.intelLabel}>Pass Rate</span>
              </div>
            </div>
            <div className={styles.intelFooter}>
              {overview?.quality.totalReports ?? 0} total reports · {overview?.quality.reportsToday ?? 0} today
            </div>
          </div>

          <div className={`card ${styles.intelCard}`}>
            <div className={styles.intelHeader}>
              <span>📚 Knowledge Base</span>
              <Link href="/knowledge" className={styles.intelLink}>View →</Link>
            </div>
            <div className={styles.intelGrid}>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>{overview?.knowledge.totalDocs ?? 0}</span>
                <span className={styles.intelLabel}>Documents</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>{formatNumber(overview?.knowledge.totalChunks ?? 0)}</span>
                <span className={styles.intelLabel}>Chunks</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>{formatNumber(overview?.knowledge.totalHits ?? 0)}</span>
                <span className={styles.intelLabel}>Hits</span>
              </div>
            </div>
          </div>

          <div className={`card ${styles.intelCard}`}>
            <div className={styles.intelHeader}><span>🔑 Platform</span></div>
            <div className={styles.intelGrid}>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>{overview?.activeKeys ?? '—'}</span>
                <span className={styles.intelLabel}>API Keys</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>{overview?.totalSessions ?? '—'}</span>
                <span className={styles.intelLabel}>Sessions</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>{overview?.completedIndexJobs ?? '—'}</span>
                <span className={styles.intelLabel}>Index Jobs</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Activity */}
        <section>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Activity</h2>
            <Link href="/sessions" className="btn btn-secondary btn-sm">All Sessions →</Link>
          </div>
          <div className={`card ${styles.activityCard}`}>
            {activityData?.activity && activityData.activity.length > 0 ? (
              <div className={styles.activityList}>
                {activityData.activity.map((event, i) => (
                  <div key={i} className={styles.activityRow}>
                    <span className={styles.activityIcon}>{toolIcon(event.detail)}</span>
                    <div className={styles.activityInfo}>
                      <span className={styles.activityDetail}>{event.detail}</span>
                      <span className={styles.activityMeta}>
                        {event.agent_id}{event.latency_ms ? ` · ${event.latency_ms}ms` : ''}
                      </span>
                    </div>
                    <div className={styles.activityRight}>
                      <span className={`badge badge-${event.status === 'ok' ? 'healthy' : 'error'}`}>{event.status}</span>
                      <span className={styles.activityTime}>{timeAgo(event.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span>💭</span>
                {overview && overview.projects.length > 0 ? (
                  <p>No tool calls yet. Activity appears when agents use MCP tools.<br />
                    <small style={{ color: 'var(--text-muted)' }}>✅ {overview.projects.length} project{overview.projects.length > 1 ? 's' : ''} registered · {formatNumber(overview.indexedSymbols)} symbols indexed</small>
                  </p>
                ) : (
                  <div style={{ textAlign: 'left', fontSize: '0.85rem' }}>
                    <p style={{ marginBottom: 'var(--space-3)' }}>Get started:</p>
                    <p>1. Register a project via <b>Projects → New Project</b></p>
                    <p>2. Index it to populate code intelligence</p>
                    <p>3. Connect your AI agent via the MCP config below</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recent Sessions Mini-List */}
          {overview?.recentSessions && overview.recentSessions.length > 0 && (
            <div className={`card ${styles.intelCard}`} style={{ marginTop: 'var(--space-4)' }}>
              <div className={styles.intelHeader}>
                <span>🔄 Recent Sessions</span>
                <Link href="/sessions" className={styles.intelLink}>All →</Link>
              </div>
              {overview.recentSessions.map((s, i) => (
                <div key={i} className={styles.sessionRow}>
                  <div className={styles.sessionInfo}>
                    <span className={styles.sessionAgent}>{s.agent}</span>
                    <span className={styles.sessionTask}>{s.task}</span>
                  </div>
                  <span className={`badge badge-${s.status === 'completed' ? 'healthy' : s.status === 'active' ? 'info' : 'warning'}`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Quick Connect */}
      <section style={{ marginTop: 'var(--space-8)' }}>
        <h2 className={styles.sectionTitle}>Quick Connect</h2>
        <div className={`card ${styles.connectCard}`}>
          <p className={styles.connectText}>Add Corn Hub to your AI agent&apos;s MCP config:</p>
          <pre className={styles.codeBlock}>
{`{
  "mcpServers": {
    "corn-hub": {
      "url": "http://localhost:8317/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}`}
          </pre>
          <Link href="/keys" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-4)' }}>
            Generate API Key →
          </Link>
        </div>
      </section>
    </DashboardLayout>
  )
}
