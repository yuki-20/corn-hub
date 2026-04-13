'use client'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import { getOrganizations } from '@/lib/api'

export default function OrgsPage() {
  const { data } = useSWR('orgs', getOrganizations, { refreshInterval: 30000 })

  return (
    <DashboardLayout title="Organizations" subtitle="Multi-tenant organization management">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
        {data?.organizations && data.organizations.length > 0 ? (
          data.organizations.map((org: any) => (
          <div key={org.id} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontSize: '1.5rem' }}>🏢</span>
              <div>
                <h3 style={{ fontWeight: 600, fontSize: '1.05rem' }}>{org.name}</h3>
                <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{org.slug}</code>
              </div>
            </div>
            {org.description && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{org.description}</p>
            )}
            <div style={{ marginTop: 'var(--space-3)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Created: {new Date(org.created_at).toLocaleDateString()}
            </div>
          </div>
          ))
        ) : (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-10)' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: 'var(--space-3)' }}>🏢</span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No organizations yet. Organizations help group projects and manage team access.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
