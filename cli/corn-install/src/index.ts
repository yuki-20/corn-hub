#!/usr/bin/env node

// ─── Corn Hub — Interactive CLI ──────────────────────────────────
// Usage: npx corn-install
//        node cli/corn-install/dist/index.js
//        node cli/corn-install/dist/index.js monitor
//
// Persistent interactive shell for the Corn Hub AI Agent Intelligence
// Platform. Never crashes — gracefully handles missing dependencies
// and offline services.

import { join } from 'node:path';
import * as ui from './ui.js';
import { getPlatform, getHomeDir, pathExists, execAsync, sleep, readJson } from './utils.js';
import { runAllChecks } from './detector.js';
import { installMissing } from './installer.js';
import { configureEnvironment } from './config.js';
import { getAvailableIdes, configureIdes } from './ide.js';
import { verifyInstallation } from './verify.js';
import { startMonitor } from './monitor.js';
import {
  showDashboard,
  showProjects,
  showApiKeys,
  showSessions,
  showQuality,
  showKnowledge,
  showSettings,
} from './dashboard.js';

const GITHUB_REPO = 'https://github.com/yuki-20/corn-hub.git';

// ─── Main ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subcommand = args.find(a => !a.startsWith('-'));

  // Handle --help
  if (args.includes('--help') || args.includes('-h')) {
    if (subcommand === 'monitor') {
      showMonitorHelp();
    } else {
      showHelp();
    }
    process.exit(0);
  }

  // Handle --version
  if (args.includes('--version') || args.includes('-v')) {
    console.log('corn-install v0.4.0');
    process.exit(0);
  }

  // ── Subcommand: monitor ─────────────────────────────────────────
  if (subcommand === 'monitor') {
    const apiUrl = getArgValue(args, '--api-url') || 'http://localhost:4000';
    const mcpUrl = getArgValue(args, '--mcp-url') || 'http://localhost:8317';
    const interval = parseInt(getArgValue(args, '--interval') || '2000', 10);

    await startMonitor({ apiUrl, mcpUrl, interval });
    return;
  }

  // ── Interactive Shell ───────────────────────────────────────────
  // Quick system check (non-blocking — just for status display)
  const sysCheck = runAllChecks();
  const platform = getPlatform();
  const platformNames: Record<string, string> = {
    win32: 'Windows', darwin: 'macOS', linux: 'Linux',
  };

  // ── Main Menu Loop — NEVER EXITS ON ERROR ───────────────────────
  let running = true;
  while (running) {
    ui.clearScreen();
    ui.banner();
    ui.info(`${platformNames[platform] || platform} (${process.arch}) - Node ${process.version}`);
    if (sysCheck.allMet) {
      ui.success('All system dependencies satisfied');
    } else {
      const missing = sysCheck.criticalMissing.map(d => d.name).join(', ');
      ui.warn(`Missing: ${missing} - use "Setup & Install" to resolve`);
    }

    const choice = await ui.menu('Corn Hub - Main Menu', [
      { key: '1', label: `${ui.colorize('>', 'cyan')} Setup & Install`, hint: 'Install deps, clone, Docker, IDE config' },
      { key: '2', label: `${ui.colorize('>', 'cyan')} Dashboard`, hint: 'Live stats & overview' },
      { key: '3', label: `${ui.colorize('>', 'cyan')} Projects`, hint: 'View registered projects' },
      { key: '4', label: `${ui.colorize('>', 'cyan')} API Keys`, hint: 'Create, delete & manage API keys' },
      { key: '5', label: `${ui.colorize('>', 'cyan')} Sessions`, hint: 'View agent sessions' },
      { key: '6', label: `${ui.colorize('>', 'cyan')} Quality`, hint: 'Quality reports & grades' },
      { key: '7', label: `${ui.colorize('>', 'cyan')} Knowledge`, hint: 'Knowledge base' },
      { key: '8', label: `${ui.colorize('>', 'cyan')} Settings`, hint: 'Services, env, MCP tools' },
      { key: '9', label: `${ui.colorize('>', 'cyan')} Live Monitor`, hint: 'Full-screen real-time dashboard' },
      { key: '0', label: `${ui.colorize('>', 'red')} Exit`, hint: 'Quit Corn Hub CLI' },
    ]);

    switch (choice) {
      case '1':
        await runSetupAndInstall();
        break;
      case '2':
        await showDashboard();
        break;
      case '3':
        await showProjects();
        break;
      case '4':
        await showApiKeys();
        break;
      case '5':
        await showSessions();
        break;
      case '6':
        await showQuality();
        break;
      case '7':
        await showKnowledge();
        break;
      case '8':
        await showSettings();
        break;
      case '9':
        await startMonitor({
          apiUrl: process.env['DASHBOARD_API_URL'] || 'http://localhost:4000',
          mcpUrl: process.env['MCP_URL'] || 'http://localhost:8317',
          interval: 2000,
        });
        break;
      case '0':
      case 'q':
      case 'exit':
      case 'quit':
        running = false;
        break;
      default:
        ui.warn(`Unknown option: "${choice}". Enter a number 0-9.`);
        break;
    }
  }

  ui.blank();
  ui.info('Goodbye! Run again anytime with: npx corn-install');
  ui.closePrompts();
}

// ═══════════════════════════════════════════════════════════════════
// Setup & Install Flow
// ═══════════════════════════════════════════════════════════════════
// Extracted from the old linear installer. All process.exit() calls
// are replaced with `return` to go back to the main menu.
async function runSetupAndInstall(): Promise<void> {
  ui.clearScreen();
  ui.blank();

  const TOTAL_STEPS = 10;
  const platform = getPlatform();

  // ── Step 1: Check prerequisites ─────────────────────────────────
  ui.step(1, TOTAL_STEPS, 'Checking prerequisites');

  const sp = ui.spinner('Running dependency checks...');
  await sleep(300);
  const sysCheck = runAllChecks();
  sp.stop('Dependency scan complete');

  ui.blank();

  const checkRows = sysCheck.checks.map(c => {
    const status = c.meetsMinimum
      ? ui.colorize('✓', 'green')
      : (c.found ? ui.colorize('⚠ outdated', 'yellow') : ui.colorize('✗ missing', 'red'));
    const ver = c.version || '—';
    return [status, c.name, ver, c.required + '+'];
  });
  ui.table(['Status', 'Dependency', 'Found', 'Required'], checkRows);

  // ── Step 2: Install missing dependencies ────────────────────────
  ui.blank();
  ui.step(2, TOTAL_STEPS, 'Resolving dependencies');

  if (sysCheck.criticalMissing.length > 0) {
    const installed = await installMissing(sysCheck.criticalMissing);
    if (!installed) {
      ui.warn('Some dependencies are still missing. You can retry later from the main menu.');
      await ui.waitForEnter();
      return; // ← Back to menu, NOT process.exit
    }

    // Re-check after installation
    ui.blank();
    const recheck = ui.spinner('Re-verifying dependencies...');
    await sleep(1000);
    const recheckResult = runAllChecks();
    recheck.stop();

    if (recheckResult.criticalMissing.length > 0) {
      ui.warn('Dependencies still missing after install. You may need to restart your terminal.');
      for (const dep of recheckResult.criticalMissing) {
        ui.substep(`${dep.name}: ${dep.found ? `v${dep.version} (need ${dep.required}+)` : 'not found'}`);
      }
      ui.info('Close this terminal, open a new one, and retry "Setup & Install".');
      await ui.waitForEnter();
      return; // ← Back to menu
    }
  }

  if (sysCheck.optionalMissing.length > 0) {
    ui.warn('Optional dependencies missing (non-blocking):');
    for (const dep of sysCheck.optionalMissing) {
      ui.substep(`${dep.name} — ${dep.installHint[platform]}`);
    }
  }

  ui.success('All critical dependencies satisfied');

  // ── Step 3: Choose install directory ─────────────────────────────
  ui.blank();
  ui.step(3, TOTAL_STEPS, 'Setting up installation directory');

  const defaultDir = join(getHomeDir(), 'corn-hub');
  const installDir = await ui.prompt('Where should Corn Hub be installed?', defaultDir);

  // ── Step 4: Clone or detect existing install ─────────────────────
  ui.blank();
  ui.step(4, TOTAL_STEPS, 'Getting Corn Hub source');

  if (pathExists(join(installDir, 'package.json'))) {
    ui.success(`Found existing installation at ${installDir}`);

    const pkg = readJson(join(installDir, 'package.json')) || {};
    if (pkg.name === 'scalpel-mcp' || pkg.name === 'corn-hub') {
      ui.success('Verified — this is a Corn Hub repository');

      const pullLatest = await ui.confirm('Pull latest changes from GitHub?', true);
      if (pullLatest) {
        const pullSp = ui.spinner('Pulling latest changes...');
        const pullResult = await execAsync('git pull', installDir);
        pullSp.stop(pullResult.ok ? 'Updated to latest' : undefined);
        if (!pullResult.ok) {
          ui.warn('Could not pull latest changes. Continuing with current version.');
        }
      }
    } else {
      ui.warn(`Directory exists but doesn't appear to be Corn Hub (found: ${pkg.name})`);
      const overwrite = await ui.confirm('Continue anyway?', false);
      if (!overwrite) {
        await ui.waitForEnter();
        return; // ← Back to menu
      }
    }
  } else {
    ui.info(`Cloning from ${GITHUB_REPO}...`);
    const cloneSp = ui.spinner('Cloning repository...');
    const cloneResult = await execAsync(`git clone ${GITHUB_REPO} "${installDir}"`);
    cloneSp.stop(cloneResult.ok ? 'Repository cloned' : undefined);

    if (!cloneResult.ok) {
      ui.errorBox('Clone Failed', [
        cloneResult.stderr.slice(0, 200),
        '',
        'Check: Internet, Git config, directory permissions',
      ]);
      await ui.waitForEnter();
      return; // ← Back to menu
    }
  }

  // ── Step 5: Configure API keys ──────────────────────────────────
  ui.blank();
  ui.step(5, TOTAL_STEPS, 'Configuring API keys');

  const envConfig = await configureEnvironment(installDir);

  // ── Step 6: Confirm env files saved ─────────────────────────────
  ui.blank();
  ui.step(6, TOTAL_STEPS, 'Environment files saved');

  ui.box('Configuration Summary', [
    `Voyage AI Key:   ${envConfig.voyageApiKey ? ui.colorize('configured', 'green') : ui.colorize('skipped (using fallback)', 'yellow')}`,
    `MCP API Key:     ${ui.colorize('generated', 'green')}`,
    `Embedding Model: ${ui.colorize(envConfig.embeddingModel, 'cyan')}`,
    `Dimensions:      ${ui.colorize(envConfig.embeddingDims, 'cyan')}`,
  ]);

  // ── Step 7: Build & start Docker stack ──────────────────────────
  ui.blank();
  ui.step(7, TOTAL_STEPS, 'Building Docker containers');
  ui.info('This may take a few minutes on first run...');
  ui.blank();

  const buildSp = ui.spinner('Building and starting Docker stack...');

  const composeFile = join(installDir, 'infra', 'docker-compose.yml');
  const envFile = join(installDir, 'infra', '.env');

  const buildResult = await execAsync(
    `docker compose -f "${composeFile}" --env-file "${envFile}" up -d --build`,
    installDir,
  );

  buildSp.stop(buildResult.ok ? 'Docker stack started' : undefined);

  if (!buildResult.ok) {
    ui.warn('Docker build failed. You can retry later.');
    ui.substep(buildResult.stderr.slice(0, 200));

    const retry = await ui.confirm('Retry the build?', true);
    if (retry) {
      ui.blank();
      const retrySp = ui.spinner('Retrying Docker build...');
      await execAsync(`docker compose -f "${composeFile}" down --remove-orphans`, installDir);
      await sleep(2000);
      const retryResult = await execAsync(
        `docker compose -f "${composeFile}" --env-file "${envFile}" up -d --build`,
        installDir,
      );
      retrySp.stop(retryResult.ok ? 'Docker stack started on retry' : undefined);

      if (!retryResult.ok) {
        ui.warn('Docker build failed again. Check logs and retry from the main menu.');
        await ui.waitForEnter();
        return; // ← Back to menu
      }
    } else {
      ui.info('Skipping Docker build. You can retry from the main menu.');
      await ui.waitForEnter();
      return; // ← Back to menu
    }
  }

  // ── Step 8: Wait for health checks ──────────────────────────────
  ui.blank();
  ui.step(8, TOTAL_STEPS, 'Waiting for services to become healthy');
  ui.info('Docker containers are starting up...');
  ui.blank();

  await sleep(5000);
  const verification = await verifyInstallation();

  // ── Step 9: IDE configuration ───────────────────────────────────
  ui.blank();
  ui.step(9, TOTAL_STEPS, 'IDE Configuration');

  // Build MCP CLI if needed
  const cliJsPath = join(installDir, 'apps', 'corn-mcp', 'dist', 'cli.js');
  if (!pathExists(cliJsPath)) {
    ui.info('Building MCP CLI binary...');
    const buildCliSp = ui.spinner('Installing dependencies and building...');
    await execAsync('pnpm install --no-frozen-lockfile', installDir);
    const buildCliResult = await execAsync('pnpm build', installDir);
    buildCliSp.stop(buildCliResult.ok ? 'MCP CLI built' : undefined);
    if (!buildCliResult.ok && !pathExists(cliJsPath)) {
      ui.warn('Could not build MCP CLI. IDE STDIO transport may not work.');
    }
  } else {
    ui.success('MCP CLI already built');
  }

  const ides = getAvailableIdes();
  const ideOptions = ides.map(ide => ({
    label: `${ide.icon} ${ide.name}`,
    value: ide.id,
    hint: ide.installed ? 'detected' : 'not detected',
    checked: ide.installed,
  }));

  const selectedIdes = await ui.multiSelect(
    'Which IDEs should Corn Hub be installed in?',
    ideOptions,
  );

  if (selectedIdes.length > 0) {
    await configureIdes(selectedIdes, installDir);
    ui.blank();
    ui.success(`Configured ${selectedIdes.length} IDE(s)`);
  } else {
    ui.info('No IDEs selected. You can configure them later from Settings.');
  }

  // ── Step 10: Summary ────────────────────────────────────────────
  ui.blank();
  ui.step(10, TOTAL_STEPS, 'Setup complete!');

  ui.successBox('🌽 Corn Hub is Ready!', [
    '',
    `${ui.colorize('Dashboard:', 'bold')}    http://localhost:3000`,
    `${ui.colorize('API:', 'bold')}          http://localhost:4000`,
    `${ui.colorize('MCP Server:', 'bold')}   http://localhost:8317/mcp`,
    '',
    `${ui.colorize('Install Dir:', 'bold')}  ${installDir}`,
    `${ui.colorize('IDEs:', 'bold')}         ${selectedIdes.length > 0 ? selectedIdes.join(', ') : 'none'}`,
    `${ui.colorize('MCP Tools:', 'bold')}    ${verification.mcpTools.toolCount || '?'} registered`,
    '',
    'Return to the main menu to explore your data!',
  ]);

  await ui.waitForEnter();
}

// ─── Help ────────────────────────────────────────────────────────
function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function showHelp(): void {
  ui.banner();
  console.log(`
  ${ui.colorize('USAGE', 'bold')}
    corn-install [command] [options]

  ${ui.colorize('COMMANDS', 'bold')}
    ${ui.colorize('(default)', 'cyan')}           Launch interactive shell
    ${ui.colorize('monitor', 'cyan')}             Start the live monitoring dashboard

  ${ui.colorize('OPTIONS', 'bold')}
    -h, --help           Show this help message
    -v, --version        Show version number

  ${ui.colorize('INTERACTIVE SHELL', 'bold')}
    The default mode launches a persistent interactive CLI with:
    • Setup & Install — dependency checks, Docker, IDE configuration
    • Dashboard — live stats, service health, token savings
    • Projects, API Keys, Sessions, Quality, Knowledge — data management
    • Settings — service health, environment, MCP tools
    • Live Monitor — full-screen real-time activity dashboard

  ${ui.colorize('EXAMPLES', 'bold')}
    npx corn-install                    # Interactive shell
    npx corn-install monitor            # Live dashboard
    corn-install monitor --interval 5000  # Refresh every 5s

  ${ui.colorize('LEARN MORE', 'bold')}
    https://github.com/yuki-20/corn-hub
`);
}

function showMonitorHelp(): void {
  ui.banner();
  console.log(`
  ${ui.colorize('USAGE', 'bold')}
    corn-install monitor [options]

  ${ui.colorize('DESCRIPTION', 'bold')}
    Start a live terminal dashboard that shows real-time MCP server activity.
    Polls the Corn Hub API and displays tool calls, latencies, agent activity,
    quality scores, and service health.

  ${ui.colorize('OPTIONS', 'bold')}
    --api-url <url>      API server URL (default: http://localhost:4000)
    --mcp-url <url>      MCP server URL (default: http://localhost:8317)
    --interval <ms>      Refresh interval in ms (default: 2000)
    -h, --help           Show this help message

  ${ui.colorize('KEYBOARD CONTROLS', 'bold')}
    ${ui.colorize('q', 'cyan')}   Quit the monitor
    ${ui.colorize('r', 'cyan')}   Force refresh
    ${ui.colorize('p', 'cyan')}   Pause/resume auto-refresh

  ${ui.colorize('EXAMPLES', 'bold')}
    corn-install monitor                         # Default settings
    corn-install monitor --interval 5000         # Slower refresh
    corn-install monitor --api-url http://remote:4000  # Remote server
`);
}

// ─── Entry Point ─────────────────────────────────────────────────
main().catch((err) => {
  ui.errorBox('Unexpected Error', [
    err.message || String(err),
    '',
    'Please report this issue:',
    'https://github.com/yuki-20/corn-hub/issues',
  ]);
  ui.closePrompts();
  process.exit(1);
});
