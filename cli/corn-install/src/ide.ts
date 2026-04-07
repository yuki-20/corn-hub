// ─── Corn Hub CLI — IDE Configuration ────────────────────────────
// Auto-configure MCP server for 6+ IDEs

import { join } from 'node:path';
import { getPlatform, getHomeDir, pathExists, readJson, writeJson, readTextFile, writeTextFile, ensureDir, appendTomlSection, type Platform } from './utils.js';
import * as ui from './ui.js';

// ─── IDE Definitions ─────────────────────────────────────────────
export interface IdeConfig {
  id: string;
  name: string;
  icon: string;
  configPath: (home: string, platform: Platform) => string;
  format: 'json-mcpServers' | 'json-servers' | 'toml';
  transport: 'stdio' | 'http';
  detectInstalled: (home: string, platform: Platform) => boolean;
}

const IDE_CONFIGS: IdeConfig[] = [
  {
    id: 'antigravity',
    name: 'Antigravity (Google)',
    icon: '🪐',
    configPath: (home, plat) => {
      if (plat === 'win32') return join(home, '.gemini', 'antigravity', 'mcp_config.json');
      return join(home, '.gemini', 'antigravity', 'mcp_config.json');
    },
    format: 'json-mcpServers',
    transport: 'http',
    detectInstalled: (home) => pathExists(join(home, '.gemini', 'antigravity')),
  },
  {
    id: 'claude-code',
    name: 'Claude Code (Anthropic)',
    icon: '🤖',
    configPath: (home) => join(home, '.claude.json'),
    format: 'json-mcpServers',
    transport: 'stdio',
    detectInstalled: (home) => pathExists(join(home, '.claude.json')) || pathExists(join(home, '.claude')),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: '🖱️',
    configPath: (home, plat) => {
      if (plat === 'win32') return join(process.env['APPDATA'] || join(home, 'AppData', 'Roaming'), 'Cursor', 'mcp.json');
      if (plat === 'darwin') return join(home, '.cursor', 'mcp.json');
      return join(home, '.cursor', 'mcp.json');
    },
    format: 'json-mcpServers',
    transport: 'stdio',
    detectInstalled: (home, plat) => {
      if (plat === 'win32') return pathExists(join(process.env['APPDATA'] || join(home, 'AppData', 'Roaming'), 'Cursor'));
      return pathExists(join(home, '.cursor'));
    },
  },
  {
    id: 'vscode',
    name: 'VS Code (GitHub Copilot)',
    icon: '💎',
    configPath: (home, plat) => {
      if (plat === 'win32') return join(process.env['APPDATA'] || join(home, 'AppData', 'Roaming'), 'Code', 'User', 'mcp.json');
      if (plat === 'darwin') return join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
      return join(home, '.config', 'Code', 'User', 'mcp.json');
    },
    format: 'json-servers',
    transport: 'stdio',
    detectInstalled: (home, plat) => {
      if (plat === 'win32') return pathExists(join(process.env['APPDATA'] || join(home, 'AppData', 'Roaming'), 'Code'));
      if (plat === 'darwin') return pathExists(join(home, 'Library', 'Application Support', 'Code'));
      return pathExists(join(home, '.config', 'Code'));
    },
  },
  {
    id: 'codex',
    name: 'Codex (OpenAI)',
    icon: '🧠',
    configPath: (home) => join(home, '.codex', 'config.toml'),
    format: 'toml',
    transport: 'stdio',
    detectInstalled: (home) => pathExists(join(home, '.codex')),
  },
  {
    id: 'windsurf',
    name: 'Windsurf (Codeium)',
    icon: '🏄',
    configPath: (home, plat) => {
      if (plat === 'win32') return join(home, '.codeium', 'windsurf', 'mcp_config.json');
      return join(home, '.codeium', 'windsurf', 'mcp_config.json');
    },
    format: 'json-mcpServers',
    transport: 'stdio',
    detectInstalled: (home) => pathExists(join(home, '.codeium', 'windsurf')),
  },
];

// ─── Public API ──────────────────────────────────────────────────

export function getAvailableIdes(): { id: string; name: string; icon: string; installed: boolean }[] {
  const home = getHomeDir();
  const plat = getPlatform();

  return IDE_CONFIGS.map(ide => ({
    id: ide.id,
    name: ide.name,
    icon: ide.icon,
    installed: ide.detectInstalled(home, plat),
  }));
}

export async function configureIdes(selectedIds: string[], installDir: string): Promise<void> {
  const home = getHomeDir();
  const plat = getPlatform();
  const cliPath = join(installDir, 'apps', 'corn-mcp', 'dist', 'cli.js').replace(/\\/g, '/');

  for (const id of selectedIds) {
    const ide = IDE_CONFIGS.find(c => c.id === id);
    if (!ide) continue;

    ui.blank();
    ui.substep(`${ide.icon} Configuring ${ui.colorize(ide.name, 'bold')}...`);

    try {
      const configPath = ide.configPath(home, plat);

      if (ide.format === 'toml') {
        await writeTomlConfig(ide, configPath, cliPath, installDir);
      } else {
        await writeJsonConfig(ide, configPath, cliPath, installDir);
      }

      ui.success(`${ide.name} configured → ${ui.colorize(configPath, 'dim')}`);
    } catch (err: any) {
      ui.error(`Failed to configure ${ide.name}: ${err.message}`);
    }
  }
}

// ─── JSON Config Writers ─────────────────────────────────────────

async function writeJsonConfig(ide: IdeConfig, configPath: string, cliPath: string, installDir: string): Promise<void> {
  let config: any = {};

  // Read existing config if present
  if (pathExists(configPath)) {
    config = readJson(configPath) || {};
  }

  // Build the server entry
  let serverEntry: any;

  if (ide.transport === 'http') {
    // Antigravity uses HTTP transport with serverURL
    serverEntry = {
      serverURL: 'http://localhost:8317/mcp',
      headers: {
        Authorization: 'Bearer corn-dev-key',
      },
    };
  } else {
    // STDIO transport
    serverEntry = {
      command: 'node',
      args: [cliPath],
      env: {
        DASHBOARD_API_URL: 'http://localhost:4000',
        QDRANT_URL: 'http://localhost:6333',
      },
    };
  }

  // Insert into correct config structure
  if (ide.format === 'json-servers') {
    // VS Code uses { "servers": { ... } }
    if (!config.servers) config.servers = {};
    config.servers['corn-hub'] = serverEntry;
  } else {
    // Most IDEs use { "mcpServers": { ... } }
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers['corn-hub'] = serverEntry;
  }

  // Show what we're about to write
  const preview = JSON.stringify(serverEntry, null, 2)
    .split('\n')
    .map(line => ui.colorize(line, 'dim'));
  ui.box(`${ide.name} — corn-hub config`, preview);

  // Write
  ensureDir(join(configPath, '..'));
  writeJson(configPath, config);
}

// ─── TOML Config Writer (Codex) ─────────────────────────────────

async function writeTomlConfig(ide: IdeConfig, configPath: string, cliPath: string, _installDir: string): Promise<void> {
  let content = '';

  if (pathExists(configPath)) {
    content = readTextFile(configPath);
  }

  const section = 'mcp_servers.corn-hub';
  const entries: Record<string, string | string[]> = {
    command: 'node',
    args: [cliPath],
  };

  // Show what we're about to write
  const preview = [
    ui.colorize(`[${section}]`, 'dim'),
    ui.colorize(`command = "node"`, 'dim'),
    ui.colorize(`args = ["${cliPath}"]`, 'dim'),
  ];
  ui.box(`${ide.name} — corn-hub config`, preview);

  content = appendTomlSection(content, section, entries);
  ensureDir(join(configPath, '..'));
  writeTextFile(configPath, content);
}
