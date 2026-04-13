// ─── Corn Hub CLI — Health Verification ──────────────────────────
// Post-install verification of all services

import { sleep } from './utils.js';
import * as ui from './ui.js';

interface ServiceStatus {
  name: string;
  url: string;
  healthy: boolean;
  version?: string;
  responseTime?: number;
  error?: string;
}

// ─── HTTP Health Check ───────────────────────────────────────────
async function checkService(name: string, url: string): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const responseTime = Date.now() - start;

    if (response.ok) {
      let version: string | undefined;
      try {
        const body = await response.json() as any;
        version = body.version || body.status;
      } catch {}

      return { name, url, healthy: true, version, responseTime };
    }

    return { name, url, healthy: false, error: `HTTP ${response.status}`, responseTime };
  } catch (err: any) {
    return { name, url, healthy: false, error: err.message?.slice(0, 100) || 'Connection refused' };
  }
}

// ─── Wait For Service ────────────────────────────────────────────
async function waitForService(name: string, url: string, timeoutMs: number = 120000): Promise<ServiceStatus> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const status = await checkService(name, url);
    if (status.healthy) return status;
    await sleep(2000);
  }

  return { name, url, healthy: false, error: 'Timeout waiting for service' };
}

// ─── MCP Tools Verification ─────────────────────────────────────
async function verifyMcpTools(mcpUrl: string): Promise<{ ok: boolean; toolCount: number; tools: string[] }> {
  try {
    // Query the MCP server root which returns the registered tool names
    const rootUrl = mcpUrl.replace(/\/mcp\/?$/, '/')
    const response = await fetch(rootUrl, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { ok: false, toolCount: 0, tools: [] };
    }

    const body = await response.json() as any;
    const tools: string[] = body.tools || [];

    return { ok: true, toolCount: tools.length, tools };
  } catch {
    return { ok: false, toolCount: 0, tools: [] };
  }
}

// ─── Public API ──────────────────────────────────────────────────

export interface VerificationResult {
  services: ServiceStatus[];
  mcpTools: { ok: boolean; toolCount: number; tools: string[] };
  allHealthy: boolean;
}

export async function verifyInstallation(): Promise<VerificationResult> {
  const services: { name: string; url: string; timeout: number }[] = [
    { name: 'Corn API', url: 'http://localhost:4000/health', timeout: 120000 },
    { name: 'Corn MCP', url: 'http://localhost:8317/health', timeout: 90000 },
    { name: 'Corn Dashboard', url: 'http://localhost:3000/', timeout: 90000 },
  ];

  const sp = ui.spinner('Waiting for services to start...');
  const results: ServiceStatus[] = [];

  for (let i = 0; i < services.length; i++) {
    const svc = services[i];
    sp.update(`Waiting for ${svc.name} (${i + 1}/${services.length})...`);

    const status = await waitForService(svc.name, svc.url, svc.timeout);
    results.push(status);

    if (status.healthy) {
      // Don't stop spinner yet, keep going
    }
  }

  sp.stop('All services checked');

  // Check MCP tools
  ui.blank();
  const toolSp = ui.spinner('Verifying MCP tools...');
  const mcpTools = await verifyMcpTools('http://localhost:8317/mcp');
  toolSp.stop(mcpTools.ok ? `Found ${mcpTools.toolCount} MCP tools` : undefined);

  if (!mcpTools.ok) {
    ui.warn('Could not verify MCP tools — server may still be initializing');
  }

  // Display results
  ui.blank();
  const allHealthy = results.every(r => r.healthy);

  const tableRows = results.map(r => [
    r.healthy ? ui.colorize('✓ UP', 'green') : ui.colorize('✗ DOWN', 'red'),
    r.name,
    r.url.replace('http://localhost:', ':'),
    r.healthy ? `${r.responseTime}ms` : r.error || 'unknown',
  ]);

  ui.table(
    ['Status', 'Service', 'Port', 'Detail'],
    tableRows,
  );

  if (mcpTools.ok && mcpTools.toolCount > 0) {
    ui.blank();
    ui.success(`${mcpTools.toolCount} MCP tools registered:`);
    // Show tools in columns
    const cols = 3;
    for (let i = 0; i < mcpTools.tools.length; i += cols) {
      const row = mcpTools.tools.slice(i, i + cols).map(t => ui.colorize(t, 'cyan'));
      ui.substep(row.join('  '));
    }
  }

  return { services: results, mcpTools, allHealthy };
}

export async function quickHealthCheck(): Promise<boolean> {
  const checks = await Promise.all([
    checkService('API', 'http://localhost:4000/health'),
    checkService('MCP', 'http://localhost:8317/health'),
  ]);
  return checks.every(c => c.healthy);
}
