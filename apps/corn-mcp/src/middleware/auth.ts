import { createLogger, hashApiKey } from '@corn/shared-utils'

const logger = createLogger('mcp-auth')

interface AuthResult {
  valid: boolean
  agentId?: string
  error?: string
}

/**
 * Validate API key from Authorization header or X-API-Key header.
 * Supports both:
 *   - Bearer <key> (standard MCP auth)
 *   - X-API-Key: <key> (legacy)
 *
 * Checks in order:
 *   1. Environment API_KEYS (format: "key1:agent1,key2:agent2")
 *   2. Dashboard-created keys in the database (via API /api/keys)
 */
export async function validateApiKey(
  request: Request,
  env: { API_KEYS: string; DASHBOARD_API_URL?: string },
): Promise<AuthResult> {
  // Extract key from headers
  const authHeader = request.headers.get('authorization')
  const xApiKey = request.headers.get('x-api-key')

  let key: string | null = null
  if (authHeader?.startsWith('Bearer ')) {
    key = authHeader.slice(7).trim()
  } else if (xApiKey) {
    key = xApiKey.trim()
  }

  // Parse API_KEYS: "key1:agent1,key2:agent2"
  const apiKeysStr = env.API_KEYS || ''
  if (!apiKeysStr && !key) {
    // If no keys configured and no key provided, allow all (dev mode)
    logger.warn('No API_KEYS configured — allowing all requests (dev mode)')
    return { valid: true, agentId: 'dev-anonymous' }
  }

  if (!key) {
    return { valid: false, error: 'No API key provided' }
  }

  // Check 1: Match against env-var keys
  if (apiKeysStr) {
    const keyPairs = apiKeysStr.split(',').map((pair) => {
      const [k, agent] = pair.split(':')
      return { key: k.trim(), agentId: agent?.trim() || 'unknown' }
    })

    const match = keyPairs.find((kp) => kp.key === key)
    if (match) {
      return { valid: true, agentId: match.agentId }
    }
  }

  // Check 2: Match against dashboard-created keys (stored as hashes)
  try {
    const keyHash = hashApiKey(key)
    const apiUrl = (env.DASHBOARD_API_URL || 'http://localhost:4000').replace(/\/$/, '')
    const res = await fetch(`${apiUrl}/api/keys/verify`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json() as { keys: Array<{ key_hash?: string; name?: string }> }
      const dbMatch = data.keys?.find((k) => k.key_hash === keyHash)
      if (dbMatch) {
        return { valid: true, agentId: dbMatch.name || 'dashboard-key' }
      }
    }
  } catch {
    // DB lookup failed — don't block auth, just skip
    logger.warn('Could not verify key against dashboard DB — skipping DB check')
  }

  // No env-var keys and no API_KEYS configured = dev mode with key
  if (!apiKeysStr) {
    logger.warn('No API_KEYS configured — allowing all requests (dev mode)')
    return { valid: true, agentId: 'dev' }
  }

  logger.warn('Invalid API key attempted')
  return { valid: false, error: 'Invalid API key' }
}
