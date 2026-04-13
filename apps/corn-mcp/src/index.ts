import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

import { registerHealthTools } from './tools/health.js'
import { registerMemoryTools } from './tools/memory.js'
import { registerKnowledgeTools } from './tools/knowledge.js'
import { registerQualityTools } from './tools/quality.js'
import { registerSessionTools } from './tools/session.js'
import { registerCodeTools } from './tools/code.js'
import { registerAnalyticsTools } from './tools/analytics.js'
import { registerChangeTools } from './tools/changes.js'
import { validateApiKey } from './middleware/auth.js'
import type { Env } from './types.js'

const app = new Hono<{ Bindings: Env }>()

// Bridge process.env → c.env for Node.js runtime
app.use('*', async (c, next) => {
  const envKeys: (keyof Env)[] = [
    'QDRANT_URL',
    'DASHBOARD_API_URL',
    'MCP_SERVER_NAME',
    'MCP_SERVER_VERSION',
    'API_KEYS',
  ]
  for (const key of envKeys) {
    if (!c.env[key] && process.env[key]) {
      ;(c.env as unknown as Record<string, string>)[key] = process.env[key]!
    }
  }
  await next()
})

app.use('*', cors())
app.use('*', logger())

// Global error handler
app.onError((err, c) => {
  console.error('[MCP Global Error]', err.message, err.stack)
  return c.json(
    {
      jsonrpc: '2.0',
      error: { code: -32603, message: err.message },
      id: null,
    },
    500,
  )
})

// Health endpoint (no auth)
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'corn-mcp',
    version: c.env.MCP_SERVER_VERSION ?? '0.3.0',
    timestamp: new Date().toISOString(),
  })
})

// ─── OAuth Discovery Stubs ────────────────────────────────
// Required for mcp-remote compatibility
app.get('/.well-known/oauth-protected-resource/mcp', (c) => {
  return c.json({
    resource: `${c.req.url.replace('/.well-known/oauth-protected-resource/mcp', '/mcp')}`,
    bearer_methods_supported: ['header'],
  })
})

app.get('/.well-known/oauth-protected-resource', (c) => {
  return c.json({
    resource: c.req.url.replace('/.well-known/oauth-protected-resource', '/'),
    bearer_methods_supported: ['header'],
  })
})

app.get('/.well-known/oauth-authorization-server', (c) =>
  c.json({ error: 'OAuth not supported. Use Bearer token.' }, 404),
)
app.get('/.well-known/openid-configuration', (c) =>
  c.json({ error: 'OAuth not supported. Use Bearer token.' }, 404),
)
app.post('/register', (c) =>
  c.json({ error: 'Dynamic client registration not supported.' }, 404),
)

// Root — server info
app.get('/', (c) => {
  return c.json({
    name: 'Corn Hub MCP Server',
    version: c.env.MCP_SERVER_VERSION ?? '0.3.0',
    mcp: '/mcp',
    health: '/health',
    tools: [
      'corn_health',
      'corn_memory_store',
      'corn_memory_search',
      'corn_knowledge_store',
      'corn_knowledge_search',
      'corn_quality_report',
      'corn_plan_quality',
      'corn_session_start',
      'corn_session_end',
      'corn_code_search',
      'corn_code_impact',
      'corn_code_context',
      'corn_detect_changes',
      'corn_cypher',
      'corn_list_repos',
      'corn_code_read',
      'corn_tool_stats',
      'corn_changes',
    ],
  })
})

// Helper: create MCP server with tools
export function createMcpServer(env: Env) {
  const server = new McpServer({
    name: env.MCP_SERVER_NAME ?? 'corn-hub',
    version: env.MCP_SERVER_VERSION ?? '0.3.0',
  })
  registerHealthTools(server, env)
  registerMemoryTools(server, env)
  registerKnowledgeTools(server, env)
  registerQualityTools(server, env)
  registerSessionTools(server, env)
  registerCodeTools(server, env)
  registerAnalyticsTools(server, env)
  registerChangeTools(server, env)
  return server
}

// ─── MCP Streamable HTTP handler ──────────────────────────
app.all('/mcp', async (c) => {
  const envWithOwner = { ...c.env } as Env & { API_KEY_OWNER?: string }

  // Auth
  try {
    const authResult = await validateApiKey(c.req.raw, c.env)
    if (!authResult.valid) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: `Unauthorized: ${authResult.error || 'Invalid API key'}. Get a key from the Dashboard → API Keys.`,
          },
          id: null,
        },
        401,
      )
    }
    if (authResult.agentId) {
      envWithOwner.API_KEY_OWNER = authResult.agentId
    }
  } catch (err) {
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: `Auth service unavailable: ${String(err)}`,
        },
        id: null,
      },
      503,
    )
  }

  const mcpServer = createMcpServer(envWithOwner)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true,
  })

  await mcpServer.connect(transport)

  // Read body and create new request for transport
  let bodyText = ''
  try {
    bodyText = await c.req.text()
  } catch {}

  const newReq = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers: c.req.raw.headers,
    body: bodyText,
  })

  // Log tool calls for telemetry
  let toolName = 'unknown'
  try {
    const p = JSON.parse(bodyText)
    if (p.method === 'tools/call') {
      toolName = p.params?.name
    }
  } catch {}

  const startTime = Date.now()

  try {
    const response = await transport.handleRequest(newReq)
    const latencyMs = Date.now() - startTime

    // Log to Dashboard API (best effort)
    if (toolName !== 'unknown') {
      const apiUrl = (c.env.DASHBOARD_API_URL || 'http://localhost:4000').replace(/\/$/, '')
      fetch(`${apiUrl}/api/metrics/query-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: envWithOwner.API_KEY_OWNER || 'unknown',
          tool: toolName,
          status: response.status >= 400 ? 'error' : 'ok',
          latencyMs,
          inputSize: bodyText.length,
        }),
      }).catch(() => {})
    }

    return response
  } catch (error: any) {
    console.error('[MCP Streamable Error]', error)
    return c.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: error.message || 'Internal error' },
        id: null,
      },
      500,
    )
  }
})

export default app
