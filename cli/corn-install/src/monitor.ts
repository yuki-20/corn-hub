// ─── Corn Hub CLI — Live Monitor Dashboard ──────────────────────
// Real-time terminal dashboard for MCP server activity.
// Polls the Corn Hub API and renders a full-screen ANSI view.
// Zero dependencies — Node.js built-ins + existing ui.ts engine.

import * as ui from './ui.js';
import { sleep } from './utils.js';

// ─── Types ───────────────────────────────────────────────────────
interface ActivityItem {
  type: string;
  detail: string;
  agent_id: string;
  status: string;
  latency_ms: number;
  created_at: string;
}

interface ToolStat {
  tool: string;
  totalCalls: number;
  successRate: number;
  errorCount: number;
  avgLatencyMs: number;
}

interface SessionItem {
  id: string;
  agent: string;
  project: string;
  task: string;
  status: string;
  createdAt: string;
}

interface QualityReport {
  id: string;
  gate_name: string;
  score_total: number;
  grade: string;
  passed: number;
  created_at: string;
}

interface OverviewData {
  projects: any[];
  totalAgents: number;
  today: { queries: number; sessions: number };
  quality: {
    lastGrade: string;
    averageScore: number;
    reportsToday: number;
    totalReports: number;
    passRate: number;
  };
  knowledge: {
    totalDocs: number;
    totalChunks: number;
    totalHits: number;
  };
  indexedSymbols: number;
  completedIndexJobs: number;
  activeKeys: number;
  totalSessions: number;
  uptime: number;
  tokenSavings: {
    totalTokensSaved: number;
    totalToolCalls: number;
    totalDataBytes: number;
    avgLatencyMs: number;
    topTools: Array<{
      tool: string;
      calls: number;
      tokensSaved: number;
      avgLatencyMs: number;
      dataBytes: number;
      successRate: number;
    }>;
  };
  recentSessions: SessionItem[];
}

interface DashboardData {
  connected: boolean;
  error?: string;
  activity: ActivityItem[];
  overview: OverviewData | null;
  toolAnalytics: { tools: ToolStat[]; summary: any } | null;
  quality: QualityReport[];
  mcpHealth: { status: string; tools?: string[] } | null;
}

// ─── ANSI Screen Control ─────────────────────────────────────────
const ESC = '\x1b[';
const CLEAR_SCREEN = `${ESC}2J`;
const MOVE_HOME = `${ESC}H`;
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;

function clearScreen(): void {
  process.stdout.write(CLEAR_SCREEN + MOVE_HOME);
}

// ─── Data Fetching ───────────────────────────────────────────────
async function fetchJson(url: string, timeoutMs: number = 3000): Promise<any> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchDashboardData(apiUrl: string, mcpUrl: string): Promise<DashboardData> {
  const [activityRes, overviewRes, analyticsRes, qualityRes, mcpRes] = await Promise.all([
    fetchJson(`${apiUrl}/api/metrics/activity?limit=15`),
    fetchJson(`${apiUrl}/api/metrics/overview`),
    fetchJson(`${apiUrl}/api/analytics/tool-analytics?days=7`),
    fetchJson(`${apiUrl}/api/quality?limit=5`),
    fetchJson(`${mcpUrl}/health`),
  ]);

  const connected = overviewRes !== null;

  return {
    connected,
    error: connected ? undefined : 'Cannot reach Corn Hub API',
    activity: activityRes?.activity || [],
    overview: overviewRes || null,
    toolAnalytics: analyticsRes || null,
    quality: qualityRes?.reports || [],
    mcpHealth: mcpRes || null,
  };
}

// ─── Dashboard Rendering ─────────────────────────────────────────
function renderDashboard(data: DashboardData, refreshCount: number, paused: boolean): void {
  clearScreen();

  const width = Math.min(process.stdout.columns || 80, 100);
  const now = new Date().toLocaleTimeString();

  // ── Header ─────────────────────────────────────────────────────
  const gradient = (text: string) => ui.colorize(text, 'yellow');
  const line = '━'.repeat(width);

  console.log(gradient(line));
  console.log();

  // Title row
  const titleLeft = `  🌽 ${ui.colorize('CORN HUB', 'bold')} — ${ui.colorize('Live Monitor', 'cyan')}`;
  const statusDot = paused
    ? ui.colorize('⏸ PAUSED', 'yellow')
    : ui.colorize('● LIVE', 'green');
  console.log(`${titleLeft}    ${statusDot}    ${ui.colorize(now, 'dim')}`);

  // Service health row
  if (data.connected) {
    const apiOk = data.overview !== null;
    const mcpOk = data.mcpHealth !== null;
    const mcpStatus = data.mcpHealth?.status || 'unknown';

    const apiDot = apiOk ? ui.colorize('✓ API', 'green') : ui.colorize('✗ API', 'red');
    const mcpDot = mcpOk ? ui.colorize(`✓ MCP (${mcpStatus})`, 'green') : ui.colorize('✗ MCP', 'red');

    const uptime = data.overview?.uptime
      ? formatUptime(data.overview.uptime)
      : '—';

    const toolCount = data.overview?.tokenSavings?.totalToolCalls || 0;
    console.log(`  ${apiDot}  ${mcpDot}    ${ui.colorize(`⏱ ${uptime}`, 'dim')}    ${ui.colorize(`${toolCount} total calls`, 'dim')}`);
  } else {
    console.log(`  ${ui.colorize('✗ Disconnected', 'red')} — ${ui.colorize(data.error || 'API unreachable', 'dim')}`);
  }

  console.log(gradient(line));
  console.log();

  if (!data.connected) {
    renderDisconnected(refreshCount);
    renderFooter(width, refreshCount, paused);
    return;
  }

  // ── Live Activity Feed ─────────────────────────────────────────
  console.log(`  ${ui.colorize('📡 Live Activity Feed', 'bold')}`);
  console.log();

  if (data.activity.length === 0) {
    console.log(`    ${ui.colorize('No activity yet — waiting for tool calls...', 'dim')}`);
  } else {
    // Table header
    const hdr = [
      ui.colorize('Time', 'dim'),
      ui.colorize('Tool', 'dim'),
      ui.colorize('Agent', 'dim'),
      ui.colorize('Latency', 'dim'),
      ui.colorize('Status', 'dim'),
    ];
    const colW = [10, 28, 14, 9, 8];

    console.log(`    ${hdr.map((h, i) => pad(h, colW[i])).join(' ')}`);
    console.log(`    ${colW.map(w => '─'.repeat(w)).join(' ')}`);

    for (const item of data.activity.slice(0, 12)) {
      const time = formatTime(item.created_at);
      const tool = item.detail || 'unknown';
      const agent = item.agent_id || '—';
      const latency = item.latency_ms ? `${item.latency_ms}ms` : '—';
      const status = item.status === 'ok'
        ? ui.colorize('✓ ok', 'green')
        : ui.colorize(`✗ ${item.status}`, 'red');

      const toolColored = tool.startsWith('corn_')
        ? ui.colorize(tool, 'cyan')
        : ui.colorize(tool, 'white');

      console.log(`    ${pad(ui.colorize(time, 'dim'), colW[0])} ${pad(toolColored, colW[1])} ${pad(ui.colorize(agent, 'magenta'), colW[2])} ${pad(latency, colW[3])} ${status}`);
    }
  }

  console.log();
  console.log(`  ${ui.colorize('─'.repeat(width - 4), 'dim')}`);
  console.log();

  // ── Tool Analytics ─────────────────────────────────────────────
  console.log(`  ${ui.colorize('🔧 Tool Performance (7d)', 'bold')}`);
  console.log();

  if (data.toolAnalytics?.tools && data.toolAnalytics.tools.length > 0) {
    const tools = data.toolAnalytics.tools.slice(0, 10);

    const tHdr = [
      ui.colorize('Tool', 'dim'),
      ui.colorize('Calls', 'dim'),
      ui.colorize('Success', 'dim'),
      ui.colorize('Avg ms', 'dim'),
      ui.colorize('Errors', 'dim'),
    ];
    const tColW = [28, 7, 9, 8, 7];

    console.log(`    ${tHdr.map((h, i) => pad(h, tColW[i])).join(' ')}`);
    console.log(`    ${tColW.map(w => '─'.repeat(w)).join(' ')}`);

    for (const t of tools) {
      const name = t.tool.startsWith('corn_')
        ? ui.colorize(t.tool, 'cyan')
        : t.tool;
      const calls = String(t.totalCalls);
      const success = `${t.successRate}%`;
      const latency = `${t.avgLatencyMs}ms`;
      const errors = t.errorCount > 0
        ? ui.colorize(String(t.errorCount), 'red')
        : ui.colorize('0', 'green');
      const successColored = Number(t.successRate) >= 95
        ? ui.colorize(success, 'green')
        : Number(t.successRate) >= 80
          ? ui.colorize(success, 'yellow')
          : ui.colorize(success, 'red');

      console.log(`    ${pad(name, tColW[0])} ${pad(calls, tColW[1])} ${pad(successColored, tColW[2])} ${pad(latency, tColW[3])} ${errors}`);
    }

    // Summary line
    if (data.toolAnalytics.summary) {
      const s = data.toolAnalytics.summary;
      console.log();
      console.log(`    ${ui.colorize('Total:', 'dim')} ${ui.colorize(String(s.totalCalls || 0), 'bold')} calls  ${ui.colorize('Agents:', 'dim')} ${ui.colorize(String(s.activeAgents || 0), 'bold')}  ${ui.colorize('Success:', 'dim')} ${ui.colorize(`${s.overallSuccessRate || 0}%`, 'green')}`);
    }
  } else {
    console.log(`    ${ui.colorize('No tool data yet — use MCP tools to generate analytics', 'dim')}`);
  }

  console.log();
  console.log(`  ${ui.colorize('─'.repeat(width - 4), 'dim')}`);
  console.log();

  // ── Bottom Row: Sessions + Quality + Knowledge ─────────────────
  const ov = data.overview;

  // Sessions
  if (ov?.recentSessions && ov.recentSessions.length > 0) {
    console.log(`  ${ui.colorize('📋 Recent Sessions', 'bold')}`);
    console.log();
    for (const s of ov.recentSessions.slice(0, 3)) {
      const statusIcon = s.status === 'active'
        ? ui.colorize('● active', 'green')
        : ui.colorize('○ done', 'dim');
      const taskShort = (s.task || '—').slice(0, 40);
      console.log(`    ${statusIcon}  ${ui.colorize(s.agent || '—', 'magenta')}  ${ui.colorize(taskShort, 'white')}`);
    }
    console.log();
  }

  // Stats row
  const statsItems: string[] = [];

  if (ov?.quality) {
    const q = ov.quality;
    const gradeColor = q.lastGrade === 'A' ? 'green' : q.lastGrade === 'B' ? 'cyan' : 'yellow';
    const passRate = q.passRate ?? 0;
    statsItems.push(`${ui.colorize('Quality:', 'dim')} ${ui.colorize(`${q.lastGrade} (${q.averageScore || 0})`, gradeColor)}  ${ui.colorize(`${passRate}% pass`, 'dim')}`);
  }

  if (ov?.knowledge) {
    const k = ov.knowledge;
    statsItems.push(`${ui.colorize('Knowledge:', 'dim')} ${ui.colorize(String(k.totalDocs), 'cyan')} docs  ${ui.colorize(String(k.totalChunks), 'cyan')} chunks  ${ui.colorize(String(k.totalHits), 'cyan')} hits`);
  }

  if (ov) {
    statsItems.push(`${ui.colorize('Agents:', 'dim')} ${ui.colorize(String(ov.totalAgents || 0), 'magenta')}  ${ui.colorize('Projects:', 'dim')} ${ui.colorize(String(ov.projects?.length || 0), 'cyan')}  ${ui.colorize('Symbols:', 'dim')} ${ui.colorize(String(ov.indexedSymbols || 0), 'cyan')}`);
  }

  if (ov?.tokenSavings) {
    const ts = ov.tokenSavings;
    const bytes = formatBytes(ts.totalDataBytes || 0);
    statsItems.push(`${ui.colorize('Data:', 'dim')} ${ui.colorize(bytes, 'cyan')}  ${ui.colorize('Avg latency:', 'dim')} ${ui.colorize(`${ts.avgLatencyMs || 0}ms`, 'cyan')}`);
  }

  if (statsItems.length > 0) {
    console.log(`  ${ui.colorize('─'.repeat(width - 4), 'dim')}`);
    console.log();
    for (const stat of statsItems) {
      console.log(`  ${stat}`);
    }
  }

  // Quality reports
  if (data.quality.length > 0) {
    console.log();
    console.log(`  ${ui.colorize('🏆 Recent Quality Reports', 'bold')}`);
    for (const q of data.quality.slice(0, 3)) {
      const gradeColor = q.grade === 'A' ? 'green' : q.grade === 'B' ? 'cyan' : 'yellow';
      const passIcon = q.passed ? ui.colorize('✓', 'green') : ui.colorize('✗', 'red');
      const time = formatTime(q.created_at);
      console.log(`    ${passIcon} ${ui.colorize(q.grade, gradeColor)} (${q.score_total}/100)  ${ui.colorize(q.gate_name, 'dim')}  ${ui.colorize(time, 'dim')}`);
    }
  }

  renderFooter(width, refreshCount, paused);
}

function renderDisconnected(refreshCount: number): void {
  console.log();
  console.log(`    ${ui.colorize('Waiting for Corn Hub API...', 'yellow')}`);
  console.log();

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const frame = frames[refreshCount % frames.length];
  console.log(`    ${ui.colorize(frame, 'magenta')} ${ui.colorize('Retrying every 2 seconds...', 'dim')}`);
  console.log();
  console.log(`    ${ui.colorize('Make sure the Docker stack is running:', 'dim')}`);
  console.log(`    ${ui.colorize('  docker compose -f infra/docker-compose.yml up -d', 'cyan')}`);
}

function renderFooter(width: number, refreshCount: number, paused: boolean): void {
  console.log();
  const gradient = (text: string) => ui.colorize(text, 'yellow');
  console.log(gradient('━'.repeat(width)));

  const controls = [
    `${ui.colorize('q', 'cyan')} quit`,
    `${ui.colorize('r', 'cyan')} refresh`,
    `${ui.colorize('p', 'cyan')} ${paused ? 'resume' : 'pause'}`,
  ].join('    ');

  const refreshDot = paused ? ui.colorize('⏸', 'yellow') : ui.colorize('●', 'green');
  console.log(`  ${refreshDot} ${controls}    ${ui.colorize(`#${refreshCount}`, 'dim')}`);
}

// ─── Helpers ─────────────────────────────────────────────────────
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso?.slice(11, 19) || '—';
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function pad(text: string, width: number): string {
  // Strip ANSI for length calc
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  const padLen = Math.max(0, width - stripped.length);
  return text + ' '.repeat(padLen);
}

// ─── Main Entry ──────────────────────────────────────────────────
export interface MonitorOptions {
  apiUrl: string;
  mcpUrl: string;
  interval: number;
}

export async function startMonitor(options: MonitorOptions): Promise<void> {
  const { apiUrl, mcpUrl, interval } = options;

  let running = true;
  let paused = false;
  let refreshCount = 0;

  // ── Setup keyboard handler ──────────────────────────────────────
  process.stdout.write(HIDE_CURSOR);

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
  }

  process.stdin.on('data', (key: string) => {
    if (key === 'q' || key === '\x03') { // q or Ctrl+C
      running = false;
    } else if (key === 'r') {
      // Force refresh — skip sleep
      refreshCount++;
    } else if (key === 'p') {
      paused = !paused;
    }
  });

  // ── Handle clean exit ───────────────────────────────────────────
  const cleanup = () => {
    process.stdout.write(SHOW_CURSOR);
    clearScreen();
    console.log(`\n  ${ui.colorize('🌽 Corn Hub Monitor stopped.', 'yellow')}\n`);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Handle terminal resize
  process.stdout.on('resize', () => {
    // Will re-render on next cycle
  });

  // ── Initial render ──────────────────────────────────────────────
  clearScreen();
  console.log(`\n  ${ui.colorize('🌽 Starting Corn Hub Monitor...', 'cyan')}`);
  console.log(`  ${ui.colorize(`API: ${apiUrl}`, 'dim')}`);
  console.log(`  ${ui.colorize(`MCP: ${mcpUrl}`, 'dim')}`);
  console.log(`  ${ui.colorize(`Refresh: every ${interval / 1000}s`, 'dim')}`);
  console.log();

  await sleep(500);

  // ── Main loop ───────────────────────────────────────────────────
  while (running) {
    if (!paused) {
      try {
        const data = await fetchDashboardData(apiUrl, mcpUrl);
        renderDashboard(data, refreshCount, paused);
      } catch (err: any) {
        clearScreen();
        console.log(`\n  ${ui.colorize('✗ Error fetching data:', 'red')} ${err.message}`);
        console.log(`  ${ui.colorize('Will retry...', 'dim')}`);
      }
      refreshCount++;
    }

    // Sleep in small increments so keyboard input is responsive
    for (let i = 0; i < interval / 100; i++) {
      if (!running) break;
      await sleep(100);
    }
  }

  cleanup();
}
