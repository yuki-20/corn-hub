// ─── Memory ─────────────────────────────────────────────
export interface MemoryEntry {
  id: string
  agentId: string
  projectId?: string
  branch?: string
  content: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface MemorySearchResult {
  id: string
  content: string
  score: number
  agentId: string
  projectId?: string
  createdAt: string
}

// ─── Knowledge ──────────────────────────────────────────
export interface KnowledgeDocument {
  id: string
  title: string
  source: 'manual' | 'agent' | 'import'
  sourceAgentId?: string
  projectId?: string
  tags: string[]
  status: 'active' | 'archived'
  hitCount: number
  chunkCount: number
  contentPreview?: string
  createdAt: string
  updatedAt: string
}

export interface KnowledgeChunk {
  id: string
  documentId: string
  chunkIndex: number
  content: string
  charCount: number
  createdAt: string
}

export interface KnowledgeSearchResult {
  id: string
  documentId: string
  title: string
  content: string
  score: number
  tags: string[]
}

// ─── Sessions ───────────────────────────────────────────
export interface Session {
  id: string
  agentId: string
  project: string
  branch?: string
  taskSummary: string
  status: 'active' | 'completed' | 'abandoned'
  filesChanged?: string[]
  decisions?: string[]
  blockers?: string[]
  createdAt: string
  completedAt?: string
}

export interface SessionHandoff {
  id: string
  fromAgent: string
  toAgent?: string
  project: string
  taskSummary: string
  context: Record<string, unknown>
  priority: number
  status: 'pending' | 'claimed' | 'completed' | 'expired'
  claimedBy?: string
  projectId?: string
  createdAt: string
  expiresAt?: string
}

// ─── Quality ────────────────────────────────────────────
export interface QualityReport {
  id: string
  projectId?: string
  agentId: string
  sessionId?: string
  gateName: string
  scoreBuild: number
  scoreRegression: number
  scoreStandards: number
  scoreTraceability: number
  scoreTotal: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  passed: boolean
  details?: Record<string, unknown>
  createdAt: string
}

// ─── API Keys ───────────────────────────────────────────
export interface ApiKey {
  id: string
  name: string
  keyHash: string
  scope: string
  permissions?: string
  projectId?: string
  createdAt: string
  expiresAt?: string
  lastUsedAt?: string
}

// ─── Projects & Organizations ───────────────────────────
export interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  orgId: string
  name: string
  slug: string
  description?: string
  gitRepoUrl?: string
  gitProvider?: 'github' | 'gitlab' | 'bitbucket' | 'local'
  indexedAt?: string
  indexedSymbols: number
  createdAt: string
  updatedAt: string
}

// ─── Usage ──────────────────────────────────────────────
export interface UsageLog {
  id: number
  agentId: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  projectId?: string
  requestType: 'chat' | 'embedding' | 'tool'
  createdAt: string
}

// ─── Query Logs ─────────────────────────────────────────
export interface QueryLog {
  id: number
  agentId: string
  tool: string
  params?: string
  latencyMs?: number
  status: string
  error?: string
  projectId?: string
  inputSize: number
  outputSize: number
  computeTokens: number
  computeModel?: string
  createdAt: string
}

// ─── Provider Accounts ──────────────────────────────────
export interface ProviderAccount {
  id: string
  name: string
  type: 'openai_compat' | 'gemini' | 'anthropic'
  authType: 'oauth' | 'api_key'
  apiBase: string
  apiKey?: string
  status: 'enabled' | 'disabled' | 'error'
  capabilities: string[]
  models: string[]
  createdAt: string
  updatedAt: string
}

// ─── Dashboard Overview ─────────────────────────────────
export interface DashboardOverview {
  projects: Project[]
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
  tokenSavings?: {
    totalTokensSaved: number
    totalToolCalls: number
    totalDataBytes: number
    avgLatencyMs: number
    avgTokensPerCall: number
    topTools: { tool: string; calls: number; tokensSaved: number; avgLatencyMs: number; dataBytes: number; successRate: number }[]
  }
  recentSessions: {
    id: string
    agent: string
    project: string
    task: string
    status: string
    createdAt: string
  }[]
}

// ─── Health ─────────────────────────────────────────────
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error'
  service: string
  version: string
  timestamp: string
  services?: Record<string, 'ok' | 'error'>
}

// ─── MCP Environment ────────────────────────────────────
export interface McpEnv {
  QDRANT_URL: string
  DASHBOARD_API_URL: string
  MCP_SERVER_NAME: string
  MCP_SERVER_VERSION: string
  API_KEYS: string
  API_KEY_OWNER?: string
}
