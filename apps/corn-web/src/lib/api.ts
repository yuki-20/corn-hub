const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

// ─── Health ─────────────────────────────────────────────
export interface HealthData {
  status: string
  service: string
  version: string
  timestamp: string
  uptime: number
  services: Record<string, string>
}

export const checkHealth = () => apiFetch<HealthData>('/health')

// ─── Dashboard Overview ─────────────────────────────────
export interface TopToolStat {
  tool: string
  calls: number
  tokensSaved: number
  avgLatencyMs: number
  dataBytes: number
  successRate: number
}

export interface RecentSession {
  id: string
  agent: string
  project: string
  task: string
  status: string
  createdAt: string
}

export interface DashboardOverview {
  projects: any[]
  totalAgents: number
  today: { queries: number; sessions: number }
  quality: {
    lastGrade: string
    averageScore: number
    reportsToday: number
    totalReports: number
    passRate: number
  }
  knowledge: { totalDocs: number; totalChunks: number; totalHits: number }
  indexedSymbols: number
  completedIndexJobs: number
  activeKeys: number
  totalSessions: number
  organizations: number
  uptime: number
  tokenSavings: {
    totalTokensSaved: number
    totalToolCalls: number
    totalDataBytes: number
    avgLatencyMs: number
    avgTokensPerCall: number
    topTools: TopToolStat[]
  }
  recentSessions: RecentSession[]
}

export const getDashboardOverview = () => apiFetch<DashboardOverview>('/api/metrics/overview')

// ─── Activity ───────────────────────────────────────────
export interface ActivityEvent {
  type: string
  detail: string
  agent_id: string
  status: string
  latency_ms?: number
  created_at: string
}

export const getActivityFeed = (limit = 20) =>
  apiFetch<{ activity: ActivityEvent[] }>(`/api/metrics/activity?limit=${limit}`)

// ─── Sessions ───────────────────────────────────────────
export const getSessions = (limit = 50) =>
  apiFetch<{ sessions: any[] }>(`/api/sessions?limit=${limit}`)

// ─── Quality ────────────────────────────────────────────
export const getQualityReports = (limit = 50) =>
  apiFetch<{ reports: any[] }>(`/api/quality?limit=${limit}`)

export const getQualityTrends = () =>
  apiFetch<{ trends: any[] }>('/api/quality/trends')

// ─── Projects ───────────────────────────────────────────
export const getProjects = () => apiFetch<{ projects: any[] }>('/api/projects')

export const createProject = (data: { name: string; description?: string; gitRepoUrl?: string }) =>
  apiFetch<{ ok: boolean; id: string }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  })

// ─── Knowledge ──────────────────────────────────────────
export const getKnowledgeDocs = (limit = 50) =>
  apiFetch<{ documents: any[] }>(`/api/knowledge?limit=${limit}`)

// ─── Keys ───────────────────────────────────────────────
export const getApiKeys = () => apiFetch<{ keys: any[] }>('/api/keys')

export const createApiKey = (data: { name: string; scope?: string }) =>
  apiFetch<{ id: string; key: string; name: string; message: string }>('/api/keys', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const deleteApiKey = (id: string) =>
  apiFetch<{ ok: boolean }>(`/api/keys/${id}`, { method: 'DELETE' })

// ─── Organizations ──────────────────────────────────────
export const getOrganizations = () =>
  apiFetch<{ organizations: any[] }>('/api/orgs')

// ─── Providers ──────────────────────────────────────────
export const getProviders = () => apiFetch<{ providers: any[] }>('/api/providers')

export const createProvider = (data: { name: string; type: string; apiBase: string; apiKey?: string; models?: string[] }) =>
  apiFetch<{ ok: boolean; id: string }>('/api/providers', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const deleteProvider = (id: string) =>
  apiFetch<{ ok: boolean }>(`/api/providers/${id}`, { method: 'DELETE' })

// ─── Usage ──────────────────────────────────────────────
export const getUsageStats = (days = 30) =>
  apiFetch<{
    totalTokens: number
    totalRequests: number
    byModel: any[]
    byAgent: any[]
    daily: any[]
  }>(`/api/usage?days=${days}`)

// ─── Tool Analytics ─────────────────────────────────────
export interface ToolAnalytics {
  summary: {
    totalCalls: number
    overallSuccessRate: number
    estimatedTokensSaved: number
    totalDataBytes: number
    activeAgents: number
  }
  tools: {
    tool: string
    totalCalls: number
    successRate: number
    errorCount: number
    avgLatencyMs: number
  }[]
  agents: {
    agentId: string
    totalCalls: number
    successRate: number
  }[]
  trend: {
    day: string
    calls: number
    errors: number
  }[]
}

export const getToolAnalytics = (days = 30) =>
  apiFetch<ToolAnalytics>(`/api/analytics/tool-analytics?days=${days}`)
