'use client'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import { getKnowledgeDocs } from '@/lib/api'

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

export default function KnowledgePage() {
  const { data } = useSWR('knowledge', () => getKnowledgeDocs(), { refreshInterval: 15000 })
  const documents = data?.documents || []
  const totalHits = documents.reduce((sum: number, d: any) => sum + (d.hit_count || 0), 0)

  return (
    <DashboardLayout title="Knowledge" subtitle="Browse and search the shared knowledge base">
      {/* Summary */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, background: 'var(--gradient-gold)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {documents.length}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Documents</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-teal)' }}>{totalHits}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Hits</div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--corn-purple)' }}>
            {new Set(documents.map((d: any) => d.source_agent_id).filter(Boolean)).size}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contributors</div>
        </div>
      </div>

      {/* Knowledge Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--space-4)' }}>
        {documents.length > 0 ? (
          documents.map((doc: any) => {
            const tags = (() => { try { return JSON.parse(doc.tags || '[]') } catch { return [] } })()
            return (
              <div key={doc.id} className="card animate-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                  <h3 style={{ fontWeight: 600, fontSize: '1rem' }}>📄 {doc.title}</h3>
                  <span className={`badge badge-${doc.source === 'agent' ? 'info' : 'healthy'}`}>{doc.source}</span>
                </div>
                {doc.content_preview && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 'var(--space-3)' }}>
                    {doc.content_preview}
                  </p>
                )}
                {tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
                    {tags.map((t: string) => (
                      <span key={t} style={{ padding: '2px 8px', background: 'var(--bg-accent)', borderRadius: '99px', fontSize: '0.7rem', color: 'var(--corn-gold)' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
                  <span>👁️ {doc.hit_count} hits</span>
                  {doc.chunk_count > 0 && <span>📦 {doc.chunk_count} chunks</span>}
                  {doc.source_agent_id && <span>🤖 {doc.source_agent_id}</span>}
                  <span>📅 {timeAgo(doc.created_at)}</span>
                </div>
              </div>
            )
          })
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
            📚 No knowledge documents yet. Agents contribute knowledge via <code>corn_knowledge_store</code>.
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
