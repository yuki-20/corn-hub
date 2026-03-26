import { createLogger } from '@corn/shared-utils'

const logger = createLogger('mem9')

// ─── Qdrant Client ──────────────────────────────────────

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
      if (res.ok) return // Collection exists

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

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536
  private apiKey: string
  private apiBase: string
  private model: string

  constructor(
    apiKey: string,
    apiBase: string = 'https://api.openai.com/v1',
    model: string = 'text-embedding-3-small',
  ) {
    this.apiKey = apiKey
    this.apiBase = apiBase
    this.model = model
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.apiBase}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Embedding API failed: ${text}`)
    }
    const data = (await res.json()) as {
      data: { embedding: number[] }[]
    }
    return data.data.map((d) => d.embedding)
  }
}

// ─── Mem9 Service (orchestrates embedding + storage) ────

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

export { QdrantClient as default }
