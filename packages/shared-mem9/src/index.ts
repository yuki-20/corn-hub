import { createLogger } from '@corn/shared-utils'
import initSqlJs, { type Database } from 'sql.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const logger = createLogger('mem9')

// ─── Qdrant Client (kept for backward compat) ──────────

interface QdrantPoint {
  id: string
  vector: number[]
  payload: Record<string, unknown>
}

interface QdrantSearchResult {
  id: string
  score: number
  payload: Record<string, unknown>
}

export class QdrantClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async ensureCollection(name: string, vectorSize: number = 1536): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/collections/${name}`, {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return

      await fetch(`${this.baseUrl}/collections/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: { size: vectorSize, distance: 'Cosine' },
        }),
      })
      logger.info(`Created Qdrant collection: ${name}`)
    } catch (err) {
      logger.error(`Failed to ensure collection ${name}:`, err)
      throw err
    }
  }

  async upsert(collection: string, points: QdrantPoint[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/collections/${collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Qdrant upsert failed: ${text}`)
    }
  }

  async search(
    collection: string,
    vector: number[],
    limit: number = 10,
    filter?: Record<string, unknown>,
  ): Promise<QdrantSearchResult[]> {
    const body: Record<string, unknown> = {
      vector,
      limit,
      with_payload: true,
    }
    if (filter) body.filter = filter

    const res = await fetch(`${this.baseUrl}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Qdrant search failed: ${text}`)
    }
    const data = (await res.json()) as { result: QdrantSearchResult[] }
    return data.result
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    await fetch(`${this.baseUrl}/collections/${collection}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: ids }),
    })
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

// ─── Embedding Service ──────────────────────────────────

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>
  dimensions: number
}

/**
 * Local hash-based embedding provider — zero external dependencies.
 * Generates deterministic pseudo-embeddings from text using character trigram
 * frequency vectors. Not as accurate as real neural embeddings, but functional
 * for basic similarity matching when no API key is available.
 */
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number

  constructor(dimensions: number = 256) {
    this.dimensions = dimensions
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this._hashEmbed(text))
  }

  private _hashEmbed(text: string): number[] {
    const vec = new Float64Array(this.dimensions)
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '')
    const words = normalized.split(/\s+/).filter(Boolean)

    // Character trigram hashing
    for (const word of words) {
      const padded = ` ${word} `
      for (let i = 0; i < padded.length - 2; i++) {
        const trigram = padded.slice(i, i + 3)
        const hash = this._simpleHash(trigram)
        const idx = Math.abs(hash) % this.dimensions
        vec[idx] += hash > 0 ? 1 : -1
      }
    }

    // Word-level hashing for broader semantic signal
    for (const word of words) {
      const hash = this._simpleHash(word)
      const idx = Math.abs(hash) % this.dimensions
      vec[idx] += (hash % 3) - 1
    }

    // L2 normalize
    let norm = 0
    for (let i = 0; i < this.dimensions; i++) {
      norm += vec[i] * vec[i]
    }
    norm = Math.sqrt(norm)
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vec[i] /= norm
      }
    }

    return Array.from(vec)
  }

  private _simpleHash(s: string): number {
    let hash = 0
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i)
      hash = ((hash << 5) - hash + ch) | 0
    }
    return hash
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number
  private apiKey: string
  private apiBase: string
  private models: string[]
  private currentModelIndex: number

  /** Current active model name */
  get model(): string {
    return this.models[this.currentModelIndex]
  }

  constructor(
    apiKey: string,
    apiBase: string = 'https://api.openai.com/v1',
    model: string = 'text-embedding-3-small',
    dimensions: number = 1536,
    fallbackModels?: string[],
  ) {
    this.apiKey = apiKey
    this.apiBase = apiBase.replace(/\/$/, '')
    this.dimensions = dimensions
    this.currentModelIndex = 0

    // Build model rotation list: primary model first, then fallbacks (deduped)
    const allModels = [model, ...(fallbackModels || [])]
    this.models = [...new Set(allModels)]
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Try each model in the rotation list
    const startIndex = this.currentModelIndex
    let attempts = 0

    while (attempts < this.models.length) {
      const activeModel = this.models[this.currentModelIndex]
      
      try {
        const result = await this._tryEmbed(texts, activeModel)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        
        // If rate-limited after all retries, rotate to next model
        if (msg.includes('429') || msg.includes('rate') || msg.includes('RPM')) {
          const nextIndex = (this.currentModelIndex + 1) % this.models.length
          
          if (nextIndex === startIndex) {
            // We've tried all models and they're all rate-limited
            throw new Error(
              `All ${this.models.length} models rate-limited. Models tried: ${this.models.join(', ')}. Last error: ${msg}`
            )
          }

          console.error(
            `[corn-mem9] ⚡ Model ${activeModel} rate-limited → rotating to ${this.models[nextIndex]}`
          )
          this.currentModelIndex = nextIndex
          attempts++
          continue
        }

        // Non rate-limit errors should still throw immediately
        throw err
      }
    }

    throw new Error(`All ${this.models.length} models exhausted`)
  }

  /** Try a single model with exponential backoff retries */
  private async _tryEmbed(texts: string[], model: string): Promise<number[][]> {
    let retries = 3
    let delay = 2000

    while (retries >= 0) {
      const res = await fetch(`${this.apiBase}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ input: texts, model }),
      })

      if (res.ok) {
        const data = (await res.json()) as { data: { embedding: number[] }[] }
        return data.data.map((d) => d.embedding)
      }

      const text = await res.text()
      
      // Retry on 429 within this model's retry budget
      if (res.status === 429 && retries > 0) {
        console.error(`[corn-mem9] ⏳ ${model} rate-limited, retry in ${delay}ms (${retries} left)`)
        retries--
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
        continue
      }
      
      throw new Error(`Embedding API failed (${model}): ${text}`)
    }
    throw new Error(`Embedding API failed after retries (${model})`)
  }
}


// ─── SQLite Vector Store (replaces Qdrant) ──────────────

interface VectorRecord {
  id: string
  vector: number[]
  payload: Record<string, unknown>
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export class SQLiteVectorStore {
  private db: Database | null = null
  private dbPath: string
  private initPromise: Promise<void> | null = null

  constructor(dbPath: string = './data/mem9-vectors.db') {
    this.dbPath = dbPath
  }

  private async ensureDb(): Promise<Database> {
    if (this.db) return this.db

    if (!this.initPromise) {
      this.initPromise = this._initDb()
    }
    await this.initPromise
    return this.db!
  }

  private async _initDb(): Promise<void> {
    const SQL = await initSqlJs()

    // Ensure directory exists
    const dir = dirname(this.dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Load existing DB or create new
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath)
      this.db = new SQL.Database(buffer)
    } else {
      this.db = new SQL.Database()
    }

    // Create tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        vector BLOB NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_vectors_collection ON vectors(collection)
    `)

    this._save()
    logger.info(`SQLite vector store initialized at ${this.dbPath}`)
  }

  private _save(): void {
    if (!this.db) return
    const data = this.db.export()
    const buffer = Buffer.from(data)
    writeFileSync(this.dbPath, buffer)
  }

  async upsert(collection: string, id: string, vector: number[], payload: Record<string, unknown>): Promise<void> {
    const db = await this.ensureDb()
    const vectorBlob = Buffer.from(new Float32Array(vector).buffer)
    const payloadJson = JSON.stringify(payload)

    db.run(
      `INSERT OR REPLACE INTO vectors (id, collection, vector, payload) VALUES (?, ?, ?, ?)`,
      [id, collection, vectorBlob, payloadJson],
    )
    this._save()
  }

  async search(
    collection: string,
    queryVector: number[],
    limit: number = 10,
    filter?: Record<string, unknown>,
  ): Promise<{ id: string; score: number; payload: Record<string, unknown> }[]> {
    const db = await this.ensureDb()

    const results = db.exec(`SELECT id, vector, payload FROM vectors WHERE collection = ?`, [collection])
    if (!results.length || !results[0].values.length) return []

    const scored: { id: string; score: number; payload: Record<string, unknown> }[] = []

    for (const row of results[0].values) {
      const id = row[0] as string
      const vectorBuf = row[1] as Uint8Array
      const payloadStr = row[2] as string

      const storedVector = Array.from(new Float32Array(vectorBuf.buffer, vectorBuf.byteOffset, vectorBuf.byteLength / 4))
      const payload = JSON.parse(payloadStr) as Record<string, unknown>

      // Apply filters
      if (filter) {
        let match = true
        for (const [key, value] of Object.entries(filter)) {
          if (payload[key] !== value) {
            match = false
            break
          }
        }
        if (!match) continue
      }

      const score = cosineSimilarity(queryVector, storedVector)
      scored.push({ id, score, payload })
    }

    // Sort by score descending and limit
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  }

  async delete(collection: string, ids: string[]): Promise<void> {
    const db = await this.ensureDb()
    const placeholders = ids.map(() => '?').join(',')
    db.run(`DELETE FROM vectors WHERE collection = ? AND id IN (${placeholders})`, [collection, ...ids])
    this._save()
  }

  async health(): Promise<boolean> {
    try {
      await this.ensureDb()
      return true
    } catch {
      return false
    }
  }
}

// ─── Mem9 Service (original — uses Qdrant) ──────────────

export class Mem9Service {
  private qdrant: QdrantClient
  private embedder: EmbeddingProvider

  constructor(qdrantUrl: string, embedder: EmbeddingProvider) {
    this.qdrant = new QdrantClient(qdrantUrl)
    this.embedder = embedder
  }

  async init(): Promise<void> {
    await this.qdrant.ensureCollection('corn_memories', this.embedder.dimensions)
    await this.qdrant.ensureCollection('corn_knowledge', this.embedder.dimensions)
    logger.info('Mem9 collections initialized')
  }

  async storeMemory(
    id: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const [vector] = await this.embedder.embed([content])
    await this.qdrant.upsert('corn_memories', [
      { id, vector, payload: { content, ...metadata, stored_at: new Date().toISOString() } },
    ])
  }

  async searchMemory(
    query: string,
    limit: number = 10,
    filter?: Record<string, unknown>,
  ): Promise<QdrantSearchResult[]> {
    const [vector] = await this.embedder.embed([query])
    const qdrantFilter = filter
      ? { must: Object.entries(filter).map(([key, value]) => ({ key, match: { value } })) }
      : undefined
    return this.qdrant.search('corn_memories', vector, limit, qdrantFilter)
  }

  async storeKnowledge(
    id: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const [vector] = await this.embedder.embed([content])
    await this.qdrant.upsert('corn_knowledge', [
      { id, vector, payload: { content, ...metadata, stored_at: new Date().toISOString() } },
    ])
  }

  async searchKnowledge(
    query: string,
    limit: number = 10,
    filter?: Record<string, unknown>,
  ): Promise<QdrantSearchResult[]> {
    const [vector] = await this.embedder.embed([query])
    const qdrantFilter = filter
      ? { must: Object.entries(filter).map(([key, value]) => ({ key, match: { value } })) }
      : undefined
    return this.qdrant.search('corn_knowledge', vector, limit, qdrantFilter)
  }

  async health(): Promise<boolean> {
    return this.qdrant.health()
  }
}

// ─── LocalMem9Service (uses SQLite — no Docker!) ────────

export class LocalMem9Service {
  private store: SQLiteVectorStore
  private embedder: EmbeddingProvider

  constructor(embedder: EmbeddingProvider, dbPath?: string) {
    this.store = new SQLiteVectorStore(dbPath)
    this.embedder = embedder
  }

  async storeMemory(
    id: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const [vector] = await this.embedder.embed([content])
    await this.store.upsert('corn_memories', id, vector, {
      content,
      ...metadata,
      stored_at: new Date().toISOString(),
    })
  }

  async searchMemory(
    query: string,
    limit: number = 10,
    filter?: Record<string, unknown>,
  ): Promise<{ id: string; score: number; payload: Record<string, unknown> }[]> {
    const [vector] = await this.embedder.embed([query])
    return this.store.search('corn_memories', vector, limit, filter)
  }

  async storeKnowledge(
    id: string,
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const [vector] = await this.embedder.embed([content])
    await this.store.upsert('corn_knowledge', id, vector, {
      content,
      ...metadata,
      stored_at: new Date().toISOString(),
    })
  }

  async searchKnowledge(
    query: string,
    limit: number = 10,
    filter?: Record<string, unknown>,
  ): Promise<{ id: string; score: number; payload: Record<string, unknown> }[]> {
    const [vector] = await this.embedder.embed([query])
    return this.store.search('corn_knowledge', vector, limit, filter)
  }

  async health(): Promise<boolean> {
    return this.store.health()
  }
}

export { QdrantClient as default }
