'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import styles from './DashboardLayout.module.css'

const NAV_ITEMS = [
  { href: '/', icon: '🏠', label: 'Dashboard' },
  { href: '/sessions', icon: '🔄', label: 'Sessions' },
  { href: '/quality', icon: '🏆', label: 'Quality' },
  { href: '/projects', icon: '📁', label: 'Projects' },
  { href: '/knowledge', icon: '📚', label: 'Knowledge' },
  { href: '/providers', icon: '🧠', label: 'Providers' },
  { href: '/usage', icon: '📊', label: 'Usage' },
  { href: '/keys', icon: '🔑', label: 'API Keys' },
  { href: '/orgs', icon: '🏢', label: 'Organizations' },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
  { href: '/setup', icon: '📖', label: 'Installation' },
]

export default function DashboardLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className={styles.shell}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🌽</span>
          <span className={styles.logoText}>Corn Hub</span>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${pathname === item.href ? styles.navItemActive : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <span className={styles.version}>v0.1.2</span>
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        <header className={styles.header}>
          <button
            className={styles.hamburger}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <div>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </header>

        <div className={styles.content}>{children}</div>
      </main>
    </div>
  )
}
