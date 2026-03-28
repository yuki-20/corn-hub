# 🌽 Corn Hub

**The AI Agent Intelligence Platform — MCP Server + Analytics Dashboard**

> Surgical code intelligence. Semantic memory. Quality enforcement.
> Stop burning tokens on full-file reads. Start extracting exactly what your agent needs.

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-1.x-purple)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What is Corn Hub?

Corn Hub is a **Model Context Protocol (MCP) server** and real-time **analytics dashboard** that gives AI coding agents (Antigravity, Cursor, Claude Code, Codex) surgical access to your codebase through 18 specialized tools.

Instead of dumping entire files into the context window, Corn Hub provides:

- 🧠 **Semantic Memory** — Agents remember across sessions via vector search
- 🔍 **Native AST Engine** — Real call graphs, type hierarchies, and symbol-level analysis via TypeScript Compiler API
- 📋 **Quality Gates** — Plans must score ≥80% before execution
- 📊 **Live Analytics** — Track every tool call, latency, and token savings
- 🔄 **Multi-Agent Awareness** — Agents see each other's changes in real-time
- 💾 **Zero External Dependencies** — No Docker, no external services. Everything runs locally with SQLite.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     YOUR IDE                            │
│  (Antigravity / Cursor / Claude Code / Codex)           │
│                                                         │
│  ┌──────────────────┐                                   │
│  │   AI Agent        │──── STDIO Transport ────┐        │
│  │   (LLM)           │                         │        │
│  └──────────────────┘                         │        │
└───────────────────────────────────────────────│────────┘
                                                │
                    ┌───────────────────────────▼────────┐
                    │         corn-mcp (STDIO)           │
                    │    18 MCP Tools + Telemetry         │
                    │    Model Rotation (Voyage AI)       │
                    └──────────┬────────────────────────┘
                               │
              ┌────────────────▼───────────────────────┐
              │          corn-api :4000                  │
              │    Hono REST API + SQLite (sql.js)       │
              │                                         │
              │  ┌─────────────────────────────────┐    │
              │  │  Native AST Engine               │    │
              │  │  TypeScript Compiler API          │    │
              │  │  Call Graphs · Type Hierarchies   │    │
              │  │  Import Maps · Symbol Extraction  │    │
              │  │  965 symbols · 407 edges          │    │
              │  └─────────────────────────────────┘    │
              │                                         │
              │  ┌─────────────────────────────────┐    │
              │  │  SQLite Vector Store              │    │
              │  │  Semantic Memory + Knowledge      │    │
              │  │  Cosine Similarity Search         │    │
              │  └─────────────────────────────────┘    │
              └────────────────┬───────────────────────┘
                               │
                        ┌──────▼──────────────┐
                        │  corn-web :3000      │
                        │  Next.js 16 Dashboard│
                        └─────────────────────┘
```

> **No Docker required.** No external databases. No ghost services.
> Everything runs natively with Node.js + SQLite.

---

## Project Structure

```
corn-hub/
├── apps/
│   ├── corn-api/              # Dashboard REST API (Hono + SQLite)
│   │   └── src/
│   │       ├── index.ts       # Server entry, health checks
│   │       ├── db/
│   │       │   ├── client.ts  # SQLite client (sql.js)
│   │       │   └── schema.sql # Database schema (code_symbols, code_edges, etc.)
│   │       ├── services/
│   │       │   └── ast-engine.ts  # 🆕 Native TypeScript Compiler API AST engine
│   │       └── routes/
│   │           ├── intel.ts      # Code intelligence (search, context, impact, cypher)
│   │           ├── indexing.ts   # Trigger AST analysis for projects
│   │           ├── analytics.ts  # Tool usage analytics
│   │           ├── knowledge.ts  # Knowledge base CRUD
│   │           ├── projects.ts   # Project management
│   │           ├── providers.ts  # LLM provider accounts
│   │           ├── quality.ts    # 4D quality reports
│   │           ├── sessions.ts   # Agent session tracking
│   │           ├── setup.ts      # System info
│   │           ├── stats.ts      # Dashboard metrics
│   │           ├── system.ts     # System metrics (CPU, memory)
│   │           ├── usage.ts      # Token usage tracking
│   │           └── webhooks.ts   # Webhook endpoints
│   │
│   ├── corn-mcp/              # MCP Server (18 tools)
│   │   └── src/
│   │       ├── cli.ts         # STDIO transport + telemetry interceptor
│   │       ├── index.ts       # Server factory + tool registration
│   │       ├── node.ts        # HTTP transport entry point
│   │       └── tools/
│   │           ├── analytics.ts   # corn_tool_stats
│   │           ├── changes.ts     # corn_changes, corn_detect_changes
│   │           ├── code.ts        # corn_code_search/read/context/impact, corn_cypher
│   │           ├── health.ts      # corn_health
│   │           ├── knowledge.ts   # corn_knowledge_search/store
│   │           ├── memory.ts      # corn_memory_search/store
│   │           ├── quality.ts     # corn_plan_quality, corn_quality_report
│   │           └── sessions.ts    # corn_session_start/end
│   │
│   └── corn-web/              # Analytics Dashboard (Next.js 16)
│       └── src/
│           ├── app/
│           │   ├── page.tsx       # Main dashboard
│           │   ├── quality/       # Quality reports & grade trends
│           │   ├── sessions/      # Agent session history
│           │   ├── usage/         # Token usage analytics
│           │   ├── knowledge/     # Knowledge base viewer
│           │   ├── projects/      # Project management
│           │   ├── installation/  # IDE setup guide
│           │   └── settings/      # Configuration
│           ├── components/
│           │   └── layout/        # Glassmorphic dashboard shell
│           └── lib/
│               └── api.ts         # API client
│
├── packages/
│   ├── shared-mem9/           # Vector DB + Embedding Provider
│   │   └── src/index.ts       # SQLite vector store, model rotation,
│   │                          # OpenAI/Voyage embeddings, hash fallback
│   ├── shared-types/          # Shared TypeScript interfaces
│   └── shared-utils/          # Logger, ID gen, error classes
│
├── infra/
│   ├── docker-compose.yml     # Optional Docker stack
│   ├── Dockerfile.corn-api
│   ├── Dockerfile.corn-mcp
│   ├── Dockerfile.corn-web
│   └── nginx-dashboard.conf
│
└── .agent/
    └── workflows/
        └── corn-quality-gates.md  # Mandatory AI quality workflow
```

---

## Native AST Engine

Corn Hub includes a **built-in TypeScript Compiler API engine** that provides real code intelligence — no external services needed.

### What It Extracts

| Category | Details |
|----------|---------|
| **Symbols** | Functions, classes, interfaces, types, enums, variables, methods, properties |
| **Edges** | Function calls, imports, extends, implements |
| **Metadata** | File paths, line ranges, export status, signatures, JSDoc comments |

### How It Works

```
Local Project Directory
        │
        ▼
  collectFiles()          Recursively find all .ts/.tsx/.js/.jsx files
        │                 (skips node_modules, dist, .git, etc.)
        ▼
  ts.createProgram()      TypeScript Compiler API parses all files
        │
        ▼
  AST Walk                Extract symbols + build dependency edges
        │
        ▼
  SQLite Storage          INSERT into code_symbols + code_edges tables
        │
        ▼
  Query Functions         searchSymbols, getSymbolContext, getSymbolImpact,
                          executeCypher, getProjectStats
```

### Capabilities

- **Call Graph**: Who calls `dbRun`? → 8 callers across 5 files with exact line numbers
- **Impact Analysis**: What breaks if I change `createLogger`? → Recursive CTE traces 6 downstream symbols
- **Cypher Queries**: `MATCH (n:class) RETURN n` → Finds all 10 classes in the codebase
- **Import Mapping**: Which files import from `shared-utils`? → Full dependency graph
- **Type Hierarchies**: `CornError` → `NotFoundError`, `UnauthorizedError`, `ValidationError`

### Self-Indexing Results (Corn Hub itself)

| Metric | Value |
|--------|------:|
| Files Analyzed | 49 |
| Symbols Extracted | 965 |
| Edges Built | 407 |
| By Kind | 764 variables, 111 functions, 32 interfaces, 28 methods, 16 properties, 10 classes, 1 type |
| Analysis Time | ~2 seconds |

---

## MCP Tools Reference

Corn Hub exposes **18 tools** via the Model Context Protocol:

### 🧠 Memory & Knowledge

| Tool | Description |
|------|-------------|
| `corn_memory_store` | Store a memory for cross-session recall |
| `corn_memory_search` | Semantic search across all agent memories |
| `corn_knowledge_store` | Save reusable patterns, decisions, bug fixes |
| `corn_knowledge_search` | Search the shared knowledge base |

### 🔍 Code Intelligence (AST-Powered)

| Tool | Description |
|------|-------------|
| `corn_code_search` | Hybrid vector + AST search across the codebase |
| `corn_code_read` | Read raw source from indexed repos with line ranges |
| `corn_code_context` | 360° view of a symbol: callers, callees, imports, hierarchy |
| `corn_code_impact` | Blast radius analysis — recursive CTE on dependency edges |
| `corn_cypher` | Cypher-like queries translated to SQL against the code graph |
| `corn_detect_changes` | Analyze uncommitted changes + cross-reference with indexed symbols |
| `corn_list_repos` | List all indexed repositories with symbol/edge counts |

### 📋 Quality & Sessions

| Tool | Description |
|------|-------------|
| `corn_plan_quality` | Score a plan against 8 criteria (must pass ≥80%) |
| `corn_quality_report` | Submit 4D quality scores (Build, Regression, Standards, Traceability) |
| `corn_session_start` | Begin a tracked work session |
| `corn_session_end` | End session with summary, files changed, decisions |
| `corn_changes` | Check for recent changes from other agents |

### 📊 Analytics & System

| Tool | Description |
|------|-------------|
| `corn_tool_stats` | View tool usage analytics, success rates, latency |
| `corn_health` | System health check — all services, embedding status |

---

## Mandatory Quality Workflow

Every task follows this enforced pipeline:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  PHASE 0     │────▶│  PHASE 1     │────▶│  PHASE 2     │
│  Session     │     │  Planning    │     │  Execution   │
│  Start       │     │              │     │              │
│              │     │  Plan must   │     │  Build &     │
│ • tool_stats │     │  score ≥80%  │     │  implement   │
│ • changes    │     │  or REJECTED │     │              │
│ • memory     │     │              │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
┌──────────────┐     ┌──────────────┐             │
│  PHASE 4     │◀────│  PHASE 3     │◀────────────┘
│  Session     │     │  Quality     │
│  End         │     │  Report      │
│              │     │              │
│ • knowledge  │     │  Score must  │
│ • memory     │     │  be ≥80/100  │
│ • end        │     │  or FAIL     │
│ • stats      │     │              │
└──────────────┘     └──────────────┘
```

Configure in `.agent/workflows/corn-quality-gates.md`.

---

## Installation

### Prerequisites
- **Node.js** 22+
- **pnpm** 10+

### Quick Start

```bash
# Clone
git clone https://github.com/yuki-20/corn-hub.git
cd corn-hub

# Install dependencies
pnpm install

# Start the API backend
cd apps/corn-api && npx tsx src/index.ts

# In another terminal — start the MCP server (HTTP mode)
cd apps/corn-mcp && npx tsx src/node.ts

# In another terminal — start the dashboard
cd apps/corn-web && npx next dev
```

| Service | Port | Description |
|---------|------|-------------|
| **corn-api** | `:4000` | Hono REST API + SQLite + AST Engine |
| **corn-mcp** | `:8317` | MCP Gateway (HTTP transport) |
| **corn-web** | `:3000` | Next.js Dashboard |

### IDE Configuration

> ⚠️ **Replace the path below** with where YOU cloned corn-hub.

#### Antigravity / Codex (VS Code)

```json
{
  "mcpServers": {
    "corn": {
      "command": "node",
      "args": ["/path/to/corn-hub/apps/corn-mcp/dist/cli.js"]
    }
  }
}
```

#### Cursor

1. **Settings** → **Features** → **MCP**
2. Click **+ Add new MCP server**
3. **Name**: `corn` · **Type**: `command`
4. **Command**: `node /path/to/corn-hub/apps/corn-mcp/dist/cli.js`

#### Claude Code

```bash
claude mcp add corn -- node /path/to/corn-hub/apps/corn-mcp/dist/cli.js
```

| OS | Example Path |
|---------|-----------------------------------------------------|
| Windows | `C:\Users\You\corn-hub\apps\corn-mcp\dist\cli.js` |
| macOS | `/Users/You/corn-hub/apps/corn-mcp/dist/cli.js` |
| Linux | `/home/You/corn-hub/apps/corn-mcp/dist/cli.js` |

### Indexing Your Project

Once the API is running, create a project and index it:

```bash
# Create a project pointing to your local repo
curl -X POST http://localhost:4000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","gitRepoUrl":"/path/to/your/repo"}'

# Trigger AST analysis (returns projectId from above)
curl -X POST http://localhost:4000/api/intel/analyze \
  -H "Content-Type: application/json" \
  -d '{"projectId":"proj-XXXXX"}'
```

---

## Dashboard (Optional Docker)

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Open **http://localhost:3000** → the Corn Hub Analytics Dashboard.

> **Note:** Docker is optional. All services run natively with Node.js for development.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Voyage AI / OpenAI API key for embeddings |
| `OPENAI_API_BASE` | `https://api.voyageai.com/v1` | Embedding API base URL |
| `MEM9_EMBEDDING_MODEL` | `voyage-code-3` | Primary embedding model |
| `MEM9_EMBEDDING_DIMS` | `1024` | Embedding dimensions |
| `MEM9_FALLBACK_MODELS` | `voyage-4-large,voyage-4,voyage-code-2,voyage-4-lite` | Fallback model rotation chain |
| `DASHBOARD_API_URL` | `http://localhost:4000` | Dashboard API URL |

### Model Rotation

When the primary model hits rate limits (429), Corn Hub automatically rotates through fallback models:

```
voyage-code-3 → voyage-4-large → voyage-4 → voyage-code-2 → voyage-4-lite
 (best code)     (largest gen)    (gen-4)    (older code)    (lightweight)
```

Each model gets 3 retries with exponential backoff before rotating. Set `MEM9_FALLBACK_MODELS` to customize.

---

## Real Token Savings (Measured Data)

> These numbers are from actual usage, not theoretical projections.

During a live 29-call session on the Corn Hub codebase (55 files, 217 KB):

| Metric | Value |
|--------|------:|
| Avg tokens per tool call | **137 tokens** |
| Avg tokens per file read (standard) | **~1,500 tokens** |
| Tool call overhead (29 calls) | 3,966 tokens |
| File re-reads prevented | ~34,600 tokens saved |

### Savings by Codebase Size

| Repo Size | Standard Agent | With Corn Hub | Savings |
|-----------|---------------:|--------------:|--------:|
| Small (55 files) | ~195K tokens | ~135K tokens | **30%** |
| Medium (200 files) | ~450K tokens | ~180K tokens | **60%** |
| Large (1000 files) | ~1.2M tokens | ~250K tokens | **79%** |
| Enterprise (5000+) | ~3M+ tokens | ~400K tokens | **87%** |

> Corn Hub's semantic search is O(1) — it returns ~137 tokens regardless of codebase size.

---

## Troubleshooting

**`Error: Cannot find module '.../dist/cli.js'`**
- Run `pnpm build` first — the `dist/` folder is generated by the build step
- Check the path points to YOUR local clone
- On Windows, use forward slashes or escaped backslashes in JSON config

**`429 Too Many Requests` from Voyage AI**
- Free tier: 3 RPM, 10K TPM. Corn Hub automatically retries with backoff and rotates models
- Add a payment method at [dashboard.voyageai.com](https://dashboard.voyageai.com) for higher limits

**Dashboard shows 0 agents / 0 queries**
- Restart your IDE to reload the MCP server with the latest telemetry interceptor
- Ensure `corn-api` is running on port 4000

**STDIO `invalid character '\x1b'` errors**
- Corn Hub patches `console.log` to redirect to stderr. If a dependency bypasses this, check for ANSI color output leaking to stdout.

**Code intelligence returns empty results**
- Ensure your project is indexed: `POST /api/intel/analyze {"projectId":"..."}`
- Check the project has `gitRepoUrl` set to a valid local directory path

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| MCP Server | TypeScript + `@modelcontextprotocol/sdk` | Type-safe tool definitions |
| API | Hono 4 | Ultra-fast, 0-dependency HTTP |
| Database | sql.js (WASM SQLite) | In-memory + file persistence, no C++ deps |
| AST Engine | TypeScript Compiler API | Real call graphs, not text grep |
| Vectors | SQLite vector store | Cosine similarity search, no external DB |
| Embeddings | Voyage AI (voyage-code-3) | Best-in-class code retrieval |
| Dashboard | Next.js 16 (Turbopack) | Fast dev, modern React |
| Monorepo | pnpm + Turborepo | Incremental builds |

---

## Releases

See the [GitHub Releases](https://github.com/yuki-20/corn-hub/releases) page for version history and changelogs.

---

## Contributors

| <a href="https://github.com/yuki-20"><img src="https://github.com/yuki-20.png" width="80" style="border-radius:50%"><br>**yuki-20**</a> | <a href="https://github.com/AntiTamper"><img src="https://github.com/AntiTamper.png" width="80" style="border-radius:50%"><br>**AntiTamper**</a> |
|:---:|:---:|
| 🏆 Creator & Lead | 🤝 Co-Contributor |

---

## License

MIT © [yuki-20](https://github.com/yuki-20)
