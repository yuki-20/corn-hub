// ─── Corn Hub CLI — Interactive Dashboard Screens ────────────────
// Each screen fetches data from the API and renders it in the terminal.
// If the API is unreachable, a friendly message is shown (never crashes).

import * as ui from './ui.js';
import { readExistingEnv, updateEnvValue, maskKey } from './config.js';

const DEFAULT_API = 'http://localhost:4000';
const DEFAULT_MCP = 'http://localhost:8317';

// ─── Shared Fetch Helper ─────────────────────────────────────────
async function fetchJson(url: string, timeoutMs: number = 4000): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeAgo(d: string): string {
  const ts = d.endsWith('Z') || d.includes('+') ? d : d + 'Z';
  const ms = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function apiUrl(): string {
  return process.env['DASHBOARD_API_URL'] || process.env['API_URL'] || DEFAULT_API;
}

function mcpUrl(): string {
  return process.env['MCP_URL'] || DEFAULT_MCP;
}

// ─── Service Availability Gate ───────────────────────────────────
async function requireApi(label: string = 'API'): Promise<boolean> {
  const health = await fetchJson(`${apiUrl()}/health`);
  if (!health) {
    ui.blank();
    ui.warn(`${label} is not reachable at ${apiUrl()}`);
    ui.info('Start services first via "Setup & Install" from the main menu.');
    ui.info(`Or start manually: node apps/corn-api/dist/index.js`);
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// 1. Dashboard Overview
// ═══════════════════════════════════════════════════════════════════
export async function showDashboard(): Promise<void> {
  ui.clearScreen();
  ui.blank();
  ui.step(0, 0, '📊 Dashboard Overview');

  if (!await requireApi()) { await ui.waitForEnter(); return; }

  const [overview, health, mcpHealth] = await Promise.all([
    fetchJson(`${apiUrl()}/api/metrics/overview`),
    fetchJson(`${apiUrl()}/health`),
    fetchJson(`${mcpUrl()}/health`),
  ]);

  // Service health
  ui.blank();
  const svc = health?.services || {};
  const rows = Object.entries(svc).map(([name, status]) => [
    status === 'ok' ? ui.colorize('● UP', 'green') : ui.colorize('● DOWN', 'red'),
    name.toUpperCase(),
    String(status),
  ]);
  if (mcpHealth) {
    rows.push([
      mcpHealth.status === 'healthy' ? ui.colorize('● UP', 'green') : ui.colorize('● DOWN', 'red'),
      'MCP SERVER',
      `${mcpHealth.version || '?'} (${mcpHealth.status})`,
    ]);
  }
  ui.table(['Status', 'Service', 'Detail'], rows);

  if (overview) {
    ui.blank();
    ui.hr();
    ui.blank();

    // Stats
    const stats = [
      ['📁 Projects', String(overview.projects?.length ?? 0)],
      ['🧠 Symbols', fmtNum(overview.indexedSymbols ?? 0)],
      ['🤖 Agents', fmtNum(overview.totalAgents ?? 0)],
      ['📊 Queries Today', fmtNum(overview.today?.queries ?? 0)],
      ['📋 Sessions Today', fmtNum(overview.today?.sessions ?? 0)],
      ['🔑 API Keys', String(overview.activeKeys ?? 0)],
      ['⚡ Uptime', fmtUptime(overview.uptime ?? 0)],
    ];
    ui.table(['Metric', 'Value'], stats);

    // Quality
    if (overview.quality) {
      ui.blank();
      ui.hr();
      ui.blank();
      const q = overview.quality;
      ui.box('🏆 Quality Gates', [
        `Last Grade:    ${ui.colorize(q.lastGrade || '—', q.lastGrade === 'A' ? 'green' : 'yellow')}`,
        `Avg Score:     ${q.averageScore ?? '—'}`,
        `Pass Rate:     ${q.passRate ?? 0}%`,
        `Reports Today: ${q.reportsToday ?? 0} / ${q.totalReports ?? 0} total`,
      ]);
    }

    // Knowledge
    if (overview.knowledge) {
      const k = overview.knowledge;
      ui.box('📚 Knowledge Base', [
        `Documents: ${fmtNum(k.totalDocs ?? 0)}`,
        `Chunks:    ${fmtNum(k.totalChunks ?? 0)}`,
        `Hits:      ${fmtNum(k.totalHits ?? 0)}`,
      ]);
    }

    // Token Savings
    if (overview.tokenSavings) {
      const ts = overview.tokenSavings;
      ui.box('💎 Token Savings', [
        `Total Saved:   ${fmtNum(ts.totalTokensSaved ?? 0)} tokens`,
        `Tool Calls:    ${fmtNum(ts.totalToolCalls ?? 0)}`,
        `Data Transfer: ${fmtBytes(ts.totalDataBytes ?? 0)}`,
        `Avg Latency:   ${ts.avgLatencyMs ?? 0}ms`,
      ]);

      // Top tools
      if (ts.topTools?.length > 0) {
        ui.blank();
        const toolRows = ts.topTools.slice(0, 8).map((t: any) => [
          t.tool.replace('corn_', ''),
          String(t.calls),
          `${t.avgLatencyMs}ms`,
          `${t.successRate ?? 100}%`,
        ]);
        ui.table(['Tool', 'Calls', 'Avg ms', 'Success'], toolRows);
      }
    }
  }

  await ui.waitForEnter();
}

// ═══════════════════════════════════════════════════════════════════
// 2. Projects
// ═══════════════════════════════════════════════════════════════════
export async function showProjects(): Promise<void> {
  ui.clearScreen();
  ui.blank();
  ui.step(0, 0, '📁 Projects');

  if (!await requireApi()) { await ui.waitForEnter(); return; }

  const data = await fetchJson(`${apiUrl()}/api/projects`);
  const projects = data?.projects || data || [];

  if (!Array.isArray(projects) || projects.length === 0) {
    ui.blank();
    ui.info('No projects registered yet.');
    ui.info('Create one from the web dashboard at http://localhost:3000/projects');
    await ui.waitForEnter();
    return;
  }

  ui.blank();
  const rows = projects.map((p: any) => [
    p.name || p.id || '—',
    p.repo_url || p.path || '—',
    p.language || '—',
    p.indexed_symbols ? fmtNum(p.indexed_symbols) : '0',
  ]);
  ui.table(['Name', 'Location', 'Language', 'Symbols'], rows);

  await ui.waitForEnter();
}

// ═══════════════════════════════════════════════════════════════════
// 3. API Keys — full CRUD with real-time MCP propagation
// ═══════════════════════════════════════════════════════════════════
export async function showApiKeys(): Promise<void> {
  let loop = true;
  while (loop) {
    ui.clearScreen();
    ui.blank();
    ui.step(0, 0, '🔑 API Keys');

    // ── Check API availability (non-blocking — screen always loads) ─
    const apiOnline = !!(await fetchJson(`${apiUrl()}/health`, 2000));

    // ── Load keys from API (only when online) ─────────────────────
    let keys: any[] = [];
    if (apiOnline) {
      const sp = ui.spinner('Loading keys...');
      const data = await fetchJson(`${apiUrl()}/api/keys`);
      sp.stop();
      keys = Array.isArray(data?.keys) ? data.keys
        : Array.isArray(data) ? data : [];
    }

    // ── Show key table ────────────────────────────────────────────
    ui.blank();
    if (!apiOnline) {
      ui.warn(`API server offline (${apiUrl()}) — DB keys unavailable.`);
      ui.info('You can still view and edit your environment config below.');
    } else if (keys.length === 0) {
      ui.info('No API keys yet — press C to create one.');
    } else {
      const rows = keys.map((k: any, i: number) => [
        String(i + 1),
        k.name || '—',
        k.scope || 'all',
        k.last_used_at ? timeAgo(k.last_used_at) : ui.colorize('never', 'dim'),
        k.created_at ? timeAgo(k.created_at) : '—',
        k.id,
      ]);
      ui.table(['#', 'Name', 'Scope', 'Last Used', 'Created', 'ID'], rows);
    }

    // ── Show .env config (always available — local files only) ────
    const installDir = process.cwd();
    const env = readExistingEnv(installDir);
    const voyageKey = env['OPENAI_API_KEY'] || '';
    const mcpEnvKeys = env['MCP_API_KEYS'] || '';

    ui.blank();
    ui.box('Environment Config (.env)', [
      `Voyage AI Key  : ${voyageKey ? maskKey(voyageKey) : ui.colorize('not set', 'yellow')}`,
      `MCP API Keys   : ${mcpEnvKeys
        ? maskKey(mcpEnvKeys.split(',')[0]!) +
          (mcpEnvKeys.includes(',') ? ui.colorize(` +${mcpEnvKeys.split(',').length - 1} more`, 'dim') : '')
        : ui.colorize('not set', 'yellow')}`,
      '',
      apiOnline
        ? ui.colorize('DB keys are active in MCP immediately (no restart needed).', 'dim')
        : ui.colorize('Start services to manage DB keys (Setup & Install → option 1).', 'dim'),
    ]);

    // ── Sub-menu — DB actions disabled when API is offline ────────
    ui.blank();
    const action = await ui.menu('API Keys', [
      { key: 'c', label: 'Create new key',   hint: apiOnline ? 'Generate & add to MCP immediately'      : ui.colorize('API offline', 'yellow') },
      { key: 'd', label: 'Delete a key',     hint: apiOnline ? 'Revoke by number — immediate'           : ui.colorize('API offline', 'yellow') },
      { key: 'v', label: 'View Voyage AI key', hint: 'Show full OPENAI_API_KEY from .env' },
      { key: 'e', label: 'Edit Voyage AI key', hint: 'Update OPENAI_API_KEY in infra/.env + .env' },
      { key: 'r', label: 'Refresh',           hint: 'Reload data from server' },
      { key: 'b', label: 'Back',              hint: '' },
    ]);

    switch (action) {
      case 'c':
        if (!apiOnline) {
          ui.blank();
          ui.warn('API server is offline — cannot create DB keys.');
          ui.info('Start services first via Setup & Install, then try again.');
          ui.info('You can still add keys to MCP_API_KEYS in infra/.env manually.');
          await ui.waitForEnter();
        } else {
          await _createKeyFlow(installDir, mcpEnvKeys);
        }
        break;
      case 'd':
        if (!apiOnline) {
          ui.blank();
          ui.warn('API server is offline — cannot delete DB keys.');
          ui.info('To revoke a key now, remove it from MCP_API_KEYS in infra/.env.');
          await ui.waitForEnter();
        } else {
          await _deleteKeyFlow(keys);
        }
        break;
      case 'v':
        await _viewVoyageKey(voyageKey);
        break;
      case 'e':
        await _editVoyageKey(installDir, voyageKey);
        break;
      case 'r':
        break; // just re-loop — table refreshes at top
      default:
        loop = false;
        break;
    }
  }
}

// ── Create key ───────────────────────────────────────────────────
async function _createKeyFlow(installDir: string, existingMcpEnvKeys: string): Promise<void> {
  ui.blank();
  const name = await ui.prompt('Key name (e.g. "claude-code", "cursor")', '');
  if (!name.trim()) {
    ui.warn('Name is required.');
    await ui.waitForEnter();
    return;
  }

  const sp = ui.spinner('Creating API key...');
  try {
    const res = await fetch(`${apiUrl()}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), scope: 'all' }),
      signal: AbortSignal.timeout(6000),
    });
    sp.stop();

    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      ui.error(`Failed: ${err.error || res.statusText}`);
      await ui.waitForEnter();
      return;
    }

    const created: any = await res.json();
    const rawKey: string = created.key || '';

    // Also persist to MCP_API_KEYS in .env for durability
    const newMcpKeys = existingMcpEnvKeys
      ? `${existingMcpEnvKeys},${rawKey}:${name.trim()}`
      : `${rawKey}:${name.trim()}`;
    updateEnvValue(installDir, 'MCP_API_KEYS', newMcpKeys);

    ui.blank();
    ui.successBox('API Key Created', [
      '',
      `  Name  : ${created.name}`,
      `  Scope : ${created.scope}`,
      `  ID    : ${created.id}`,
      '',
      '  ⚠  Copy this key — it will NOT be shown again:',
      '',
      `  ${ui.colorize(rawKey, 'green')}`,
      '',
      '  This key is active in the MCP server immediately.',
      '  It has also been saved to infra/.env (MCP_API_KEYS).',
    ]);
  } catch (err: any) {
    sp.stop();
    ui.error(`Error: ${err.message}`);
  }
  await ui.waitForEnter();
}

// ── Delete key ────────────────────────────────────────────────────
async function _deleteKeyFlow(keys: any[]): Promise<void> {
  if (keys.length === 0) {
    ui.blank();
    ui.info('No keys to delete.');
    await ui.waitForEnter();
    return;
  }

  ui.blank();
  const numStr = await ui.prompt(`Delete key number (1–${keys.length})`, '');
  const idx = parseInt(numStr, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= keys.length) {
    ui.warn('Invalid number.');
    await ui.waitForEnter();
    return;
  }

  const target = keys[idx];
  ui.blank();
  const ok = await ui.confirm(
    `Delete "${target.name}" (${target.id})? This revokes it immediately.`,
    false,
  );
  if (!ok) return;

  const sp = ui.spinner('Deleting key...');
  try {
    const res = await fetch(`${apiUrl()}/api/keys/${target.id}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    });
    sp.stop();

    if (!res.ok) {
      ui.error(`Failed: ${res.statusText}`);
    } else {
      ui.success(`Key "${target.name}" deleted. MCP auth will reject it immediately.`);
    }
  } catch (err: any) {
    sp.stop();
    ui.error(`Error: ${err.message}`);
  }
  await ui.waitForEnter();
}

// ── View Voyage AI key ───────────────────────────────────────────
async function _viewVoyageKey(voyageKey: string): Promise<void> {
  ui.blank();
  if (!voyageKey) {
    ui.warn('OPENAI_API_KEY is not set in infra/.env or .env');
    await ui.waitForEnter();
    return;
  }
  const ok = await ui.confirm('Show full Voyage AI key?', false);
  if (!ok) return;
  ui.blank();
  ui.box('Voyage AI Key (OPENAI_API_KEY)', [
    '',
    `  ${ui.colorize(voyageKey, 'cyan')}`,
    '',
  ]);
  await ui.waitForEnter();
}

// ── Edit Voyage AI key ────────────────────────────────────────────
async function _editVoyageKey(installDir: string, current: string): Promise<void> {
  ui.blank();
  if (current) {
    ui.info(`Current key: ${maskKey(current)}`);
  }
  const newKey = await ui.promptSecret('Enter new Voyage AI key (pa-...)');
  if (!newKey.trim()) {
    ui.warn('No key entered — unchanged.');
    await ui.waitForEnter();
    return;
  }

  const saved = updateEnvValue(installDir, 'OPENAI_API_KEY', newKey.trim());
  // Also keep OPENAI_API_BASE consistent
  updateEnvValue(installDir, 'OPENAI_API_BASE', 'https://api.voyageai.com/v1');

  ui.blank();
  if (saved) {
    ui.success('Voyage AI key updated in infra/.env and .env');
    ui.info('Restart the corn-api and mem9 services to apply the new key:');
    ui.substep('docker compose -f infra/docker-compose.yml restart');
  } else {
    ui.warn('No .env files found — create them via Setup & Install first.');
  }
  await ui.waitForEnter();
}

// ═══════════════════════════════════════════════════════════════════
// 4. Sessions
// ═══════════════════════════════════════════════════════════════════
export async function showSessions(): Promise<void> {
  ui.clearScreen();
  ui.blank();
  ui.step(0, 0, '📋 Sessions');

  if (!await requireApi()) { await ui.waitForEnter(); return; }

  const data = await fetchJson(`${apiUrl()}/api/sessions?limit=20`);
  const sessions = data?.sessions || data || [];

  if (!Array.isArray(sessions) || sessions.length === 0) {
    ui.blank();
    ui.info('No sessions yet. Sessions are created when AI agents use MCP tools.');
    await ui.waitForEnter();
    return;
  }

  ui.blank();
  const rows = sessions.slice(0, 15).map((s: any) => {
    const status = s.status === 'active'
      ? ui.colorize('● active', 'green')
      : s.status === 'completed'
        ? ui.colorize('○ done', 'dim')
        : ui.colorize(`○ ${s.status}`, 'yellow');
    return [
      status,
      s.agent || s.agent_id || '—',
      (s.task || '—').slice(0, 40),
      s.created_at ? timeAgo(s.created_at) : '—',
    ];
  });
  ui.table(['Status', 'Agent', 'Task', 'Started'], rows);

  await ui.waitForEnter();
}

// ═══════════════════════════════════════════════════════════════════
// 5. Quality Reports
// ═══════════════════════════════════════════════════════════════════
export async function showQuality(): Promise<void> {
  ui.clearScreen();
  ui.blank();
  ui.step(0, 0, '🏆 Quality Reports');

  if (!await requireApi()) { await ui.waitForEnter(); return; }

  const data = await fetchJson(`${apiUrl()}/api/quality?limit=15`);
  const reports = data?.reports || data || [];

  if (!Array.isArray(reports) || reports.length === 0) {
    ui.blank();
    ui.info('No quality reports yet. Reports are generated via corn_quality_report tool.');
    await ui.waitForEnter();
    return;
  }

  ui.blank();
  const rows = reports.slice(0, 12).map((r: any) => {
    const gradeColor = r.grade === 'A' ? 'green' : r.grade === 'B' ? 'cyan' : 'yellow';
    const passIcon = r.passed ? ui.colorize('✓ PASS', 'green') : ui.colorize('✗ FAIL', 'red');
    return [
      passIcon,
      ui.colorize(r.grade || '—', gradeColor),
      `${r.score_total ?? '—'}/100`,
      r.gate_name || '—',
      r.created_at ? timeAgo(r.created_at) : '—',
    ];
  });
  ui.table(['Result', 'Grade', 'Score', 'Gate', 'When'], rows);

  await ui.waitForEnter();
}

// ═══════════════════════════════════════════════════════════════════
// 6. Knowledge Base
// ═══════════════════════════════════════════════════════════════════
export async function showKnowledge(): Promise<void> {
  ui.clearScreen();
  ui.blank();
  ui.step(0, 0, '📚 Knowledge Base');

  if (!await requireApi()) { await ui.waitForEnter(); return; }

  const data = await fetchJson(`${apiUrl()}/api/knowledge?limit=20`);
  const docs = data?.documents || data?.items || data || [];

  ui.blank();
  if (!Array.isArray(docs) || docs.length === 0) {
    ui.info('No knowledge documents stored yet.');
    ui.info('Store knowledge via corn_knowledge_store MCP tool.');
  } else {
    const rows = docs.slice(0, 15).map((d: any) => [
      (d.title || d.category || '—').slice(0, 30),
      d.category || d.type || '—',
      d.chunks ? String(d.chunks) : '—',
      d.created_at ? timeAgo(d.created_at) : '—',
    ]);
    ui.table(['Title', 'Category', 'Chunks', 'Added'], rows);
  }

  await ui.waitForEnter();
}

// ═══════════════════════════════════════════════════════════════════
// 7. Settings & Services
// ═══════════════════════════════════════════════════════════════════
export async function showSettings(): Promise<void> {
  ui.clearScreen();
  ui.blank();
  ui.step(0, 0, '⚙️  Settings & Services');

  // System info (always available, no API needed)
  ui.blank();
  ui.box('System Information', [
    `Node.js:     ${process.version}`,
    `Platform:    ${process.platform} (${process.arch})`,
    `CWD:         ${process.cwd()}`,
    `API URL:     ${apiUrl()}`,
    `MCP URL:     ${mcpUrl()}`,
  ]);

  // Check services
  ui.blank();
  const sp = ui.spinner('Checking services...');

  const [apiHealth, mcpRoot, mcpHealth] = await Promise.all([
    fetchJson(`${apiUrl()}/health`),
    fetchJson(`${mcpUrl()}/`),
    fetchJson(`${mcpUrl()}/health`),
  ]);
  sp.stop('Service check complete');

  ui.blank();
  const svcRows: string[][] = [];

  // API
  if (apiHealth) {
    svcRows.push([ui.colorize('● UP', 'green'), 'Corn API', `v${apiHealth.version || '?'}`, `${apiUrl()}`]);
  } else {
    svcRows.push([ui.colorize('● DOWN', 'red'), 'Corn API', '—', `${apiUrl()}`]);
  }

  // MCP
  if (mcpHealth) {
    svcRows.push([ui.colorize('● UP', 'green'), 'Corn MCP', `v${mcpHealth.version || '?'} (${mcpHealth.status})`, `${mcpUrl()}`]);
  } else {
    svcRows.push([ui.colorize('● DOWN', 'red'), 'Corn MCP', '—', `${mcpUrl()}`]);
  }

  ui.table(['Status', 'Service', 'Version', 'URL'], svcRows);

  // MCP tools
  if (mcpRoot?.tools?.length) {
    ui.blank();
    ui.success(`${mcpRoot.tools.length} MCP tools registered:`);
    const cols = 3;
    for (let i = 0; i < mcpRoot.tools.length; i += cols) {
      const row = mcpRoot.tools.slice(i, i + cols).map((t: string) => ui.colorize(t, 'cyan'));
      ui.substep(row.join('  '));
    }
  }

  // Environment
  ui.blank();
  const envVars = ['OPENAI_API_BASE', 'OPENAI_API_KEY', 'MEM9_EMBEDDING_MODEL', 'MCP_API_KEYS', 'DATABASE_PATH'];
  const envRows = envVars.map(key => {
    const val = process.env[key];
    if (!val) return [ui.colorize(key, 'dim'), ui.colorize('not set', 'yellow')];
    if (key.includes('KEY')) return [key, `${val.slice(0, 6)}${'•'.repeat(Math.min(val.length - 6, 12))}`];
    return [key, val];
  });
  ui.table(['Variable', 'Value'], envRows);

  await ui.waitForEnter();
}
