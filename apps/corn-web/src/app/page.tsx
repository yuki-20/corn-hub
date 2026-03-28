'use client'

import Link from 'next/link'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import { checkHealth, getDashboardOverview, getActivityFeed, type ActivityEvent } from '@/lib/api'
import styles from './page.module.css'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
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

function GaugeChart({ value, label, color, icon }: { value: number; label: string; color: string; icon: string }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  return (
    <div className={styles.gaugeCard}>
      <svg viewBox="0 0 100 100" className={styles.gaugeSvg}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="6" opacity="0.3" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset 0.6s ease', filter: `drop-shadow(0 0 6px ${color}40)` }} />
      </svg>
      <div className={styles.gaugeCenter}>
        <span>{icon}</span>
        <span className={styles.gaugeValue}>{value}%</span>
      </div>
      <div className={styles.gaugeLabel}>{label}</div>
    </div>
  )
}

export default function DashboardPage() {
  const { data: health, isLoading, mutate } = useSWR('health', checkHealth, { refreshInterval: 30000 })
  const { data: overview } = useSWR('overview', getDashboardOverview, { refreshInterval: 15000 })
  const { data: activityData } = useSWR('activity', () => getActivityFeed(15), { refreshInterval: 15000 })

  const svcMap = health?.services as Record<string, string> | undefined

  return (
    <DashboardLayout title="Dashboard" subtitle="System overview and project health">
      {/* Hero Stats */}
      <div className={styles.heroBar}>
        <StatPill icon="📁" value={overview ? String(overview.projects.length) : '...'} label="Projects" />
        <StatPill icon="🤖" value={overview ? formatNumber(overview.totalAgents) : '...'} label="Agents" />
        <StatPill icon="📊" value={overview ? formatNumber(overview.today.queries) : '...'} label="Queries Today" />
        <StatPill icon="💎" value={overview ? formatNumber(overview.tokenSavings?.totalTokensSaved ?? 0) : '...'} label="Tokens Saved" />
        <StatPill icon="🏆" value={overview?.quality.lastGrade ?? '...'} label="Quality" />
        <StatPill icon="⚡" value={overview ? `${Math.floor(overview.uptime / 3600)}h` : '...'} label="Uptime" />
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
                <span className={styles.intelValue}>{overview?.quality.reportsToday ?? 0}</span>
                <span className={styles.intelLabel}>Today</span>
              </div>
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
                <span className={styles.intelValue}>{overview?.organizations ?? '—'}</span>
                <span className={styles.intelLabel}>Orgs</span>
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
                    <span className={styles.activityIcon}>🔍</span>
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
                <span>📭</span>
                <p>No activity yet. Events appear when agents make API calls.</p>
              </div>
            )}
          </div>
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
