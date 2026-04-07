#!/usr/bin/env node

// ─── Corn Hub — One-Command Installer ────────────────────────────
// Usage: npx corn-install
//        node cli/corn-install/dist/index.js
//        node cli/corn-install/dist/index.js monitor
//
// Installs the complete Corn Hub AI Agent Intelligence Platform
// with a beautiful Claude-Code-style terminal UI.
// Also provides a live monitoring dashboard for MCP server activity.

import { join } from 'node:path';
import * as ui from './ui.js';
import { getPlatform, getHomeDir, pathExists, execAsync, sleep, readJson } from './utils.js';
import { runAllChecks } from './detector.js';
import { installMissing } from './installer.js';
import { configureEnvironment } from './config.js';
import { getAvailableIdes, configureIdes } from './ide.js';
import { verifyInstallation } from './verify.js';
import { startMonitor } from './monitor.js';

const GITHUB_REPO = 'https://github.com/yuki-20/corn-hub.git';
const TOTAL_STEPS = 14;

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
    console.log('corn-install v0.3.0');
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

  const startTime = Date.now();

  // ────────────────────────────────────────────────────────────────
  // Step 1: Welcome
  // ────────────────────────────────────────────────────────────────
  ui.banner();

  ui.step(1, TOTAL_STEPS, 'Welcome');
  ui.info('This installer will set up the complete Corn Hub stack:');
  ui.substep('Docker containers (API, MCP Server, Dashboard, Qdrant)');
  ui.substep('IDE integration (Antigravity, Claude Code, Cursor, VS Code, Codex, Windsurf)');
  ui.substep('Voyage AI embeddings configuration');
  ui.blank();

  const proceed = await ui.confirm('Ready to start?');
  if (!proceed) {
    ui.info('Installation cancelled. Run again when ready!');
    ui.closePrompts();
    process.exit(0);
  }

  // ────────────────────────────────────────────────────────────────
  // Step 2: Detect OS
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(2, TOTAL_STEPS, 'Detecting system environment');

  const platform = getPlatform();
  const platformNames: Record<string, string> = {
    win32: 'Windows',
    darwin: 'macOS',
    linux: 'Linux',
  };

  const think = ui.thinking('Scanning system configuration');
  await sleep(800);
  think.stop(`Detected ${platformNames[platform] || platform} (${process.arch})`);

  // ────────────────────────────────────────────────────────────────
  // Step 3: Check prerequisites
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(3, TOTAL_STEPS, 'Checking prerequisites');

  const sp = ui.spinner('Running dependency checks...');
  await sleep(300);
  const sysCheck = runAllChecks();
  sp.stop('Dependency scan complete');

  ui.blank();

  // Display results as a table
  const checkRows = sysCheck.checks.map(c => {
    const status = c.meetsMinimum
      ? ui.colorize('✓', 'green')
      : (c.found ? ui.colorize('⚠ outdated', 'yellow') : ui.colorize('✗ missing', 'red'));
    const ver = c.version || '—';
    return [status, c.name, ver, c.required + '+'];
  });

  ui.table(['Status', 'Dependency', 'Found', 'Required'], checkRows);

  // ────────────────────────────────────────────────────────────────
  // Step 4: Install missing dependencies
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(4, TOTAL_STEPS, 'Resolving dependencies');

  if (sysCheck.criticalMissing.length > 0) {
    const installed = await installMissing(sysCheck.criticalMissing);
    if (!installed) {
      ui.errorBox('Installation Cannot Continue', [
        'Critical dependencies are missing.',
        'Please install them manually and re-run.',
      ]);
      ui.closePrompts();
      process.exit(1);
    }

    // Re-check after installation
    ui.blank();
    const recheck = ui.spinner('Re-verifying dependencies...');
    await sleep(1000);
    const recheckResult = runAllChecks();
    recheck.stop();

    if (recheckResult.criticalMissing.length > 0) {
      ui.errorBox('Dependencies Still Missing', recheckResult.criticalMissing.map(d =>
        `${d.name}: ${d.found ? `v${d.version} (need ${d.required}+)` : 'not found'}`,
      ));
      ui.info('Some dependencies may require a terminal restart to take effect.');
      ui.info('Close this terminal, open a new one, and re-run the installer.');
      ui.closePrompts();
      process.exit(1);
    }
  }

  if (sysCheck.optionalMissing.length > 0) {
    ui.warn('Optional dependencies missing (non-blocking):');
    for (const dep of sysCheck.optionalMissing) {
      ui.substep(`${dep.name} — ${dep.installHint[platform]}`);
    }
  }

  ui.success('All critical dependencies satisfied');

  // ────────────────────────────────────────────────────────────────
  // Step 5: Choose install directory
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(5, TOTAL_STEPS, 'Setting up installation directory');

  const defaultDir = join(getHomeDir(), 'corn-hub');
  const installDir = await ui.prompt('Where should Corn Hub be installed?', defaultDir);

  // ────────────────────────────────────────────────────────────────
  // Step 6: Clone or detect existing install
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(6, TOTAL_STEPS, 'Getting Corn Hub source');

  if (pathExists(join(installDir, 'package.json'))) {
    ui.success(`Found existing installation at ${installDir}`);

    // Check if it's a corn-hub repo
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
        ui.closePrompts();
        process.exit(1);
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
        'Please check:',
        '• Internet connectivity',
        '• Git is properly configured',
        `• Directory ${installDir} is writable`,
      ]);
      ui.closePrompts();
      process.exit(1);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Step 7: Prompt for Voyage API key
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(7, TOTAL_STEPS, 'Configuring API keys');

  const envConfig = await configureEnvironment(installDir);

  // ────────────────────────────────────────────────────────────────
  // Step 8: Confirm env files saved
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(8, TOTAL_STEPS, 'Environment files saved');

  ui.box('Configuration Summary', [
    `Voyage AI Key:   ${envConfig.voyageApiKey ? ui.colorize('configured', 'green') : ui.colorize('skipped (using fallback)', 'yellow')}`,
    `MCP API Key:     ${ui.colorize('generated', 'green')}`,
    `Embedding Model: ${ui.colorize(envConfig.embeddingModel, 'cyan')}`,
    `Dimensions:      ${ui.colorize(envConfig.embeddingDims, 'cyan')}`,
  ]);

  // ────────────────────────────────────────────────────────────────
  // Step 9: Build & start Docker stack
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(9, TOTAL_STEPS, 'Building Docker containers');
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
    ui.errorBox('Docker Build Failed', [
      'The Docker build encountered an error:',
      '',
      buildResult.stderr.slice(0, 300),
      '',
      'Common fixes:',
      '• Make sure Docker Desktop is running',
      '• Check no other services are using ports 3000, 4000, 6333, 8317',
      '• Try: docker compose -f infra/docker-compose.yml down --remove-orphans',
    ]);

    const retry = await ui.confirm('Retry the build?', true);
    if (retry) {
      ui.blank();
      const retrySp = ui.spinner('Retrying Docker build...');

      // Clean first
      await execAsync(`docker compose -f "${composeFile}" down --remove-orphans`, installDir);
      await sleep(2000);

      const retryResult = await execAsync(
        `docker compose -f "${composeFile}" --env-file "${envFile}" up -d --build`,
        installDir,
      );

      retrySp.stop(retryResult.ok ? 'Docker stack started on retry' : undefined);

      if (!retryResult.ok) {
        ui.error('Docker build failed again. Please check the logs:');
        ui.substep(`docker compose -f "${composeFile}" logs`);
        ui.closePrompts();
        process.exit(1);
      }
    } else {
      ui.closePrompts();
      process.exit(1);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Step 10: Wait for health checks
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(10, TOTAL_STEPS, 'Waiting for services to become healthy');
  ui.info('Docker containers are starting up...');
  ui.blank();

  // Give services a head start
  await sleep(5000);

  const verification = await verifyInstallation();

  // ────────────────────────────────────────────────────────────────
  // Step 11: Build MCP CLI (for STDIO IDEs)
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(11, TOTAL_STEPS, 'Building MCP CLI for IDE integration');

  // Check if dist/cli.js exists
  const cliJsPath = join(installDir, 'apps', 'corn-mcp', 'dist', 'cli.js');
  if (!pathExists(cliJsPath)) {
    ui.info('Building MCP CLI binary...');
    const buildCliSp = ui.spinner('Installing dependencies and building...');

    // Install deps
    await execAsync('pnpm install --no-frozen-lockfile', installDir);
    // Build
    const buildCliResult = await execAsync('pnpm build', installDir);

    buildCliSp.stop(buildCliResult.ok ? 'MCP CLI built' : undefined);

    if (!buildCliResult.ok && !pathExists(cliJsPath)) {
      ui.warn('Could not build MCP CLI. IDE STDIO transport may not work.');
      ui.info('STDIO IDEs will fall back to HTTP transport.');
    }
  } else {
    ui.success('MCP CLI already built');
  }

  // ────────────────────────────────────────────────────────────────
  // Step 12: Ask which IDEs to configure
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(12, TOTAL_STEPS, 'IDE Configuration');

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
    ui.info('No IDEs selected. You can configure them later from the Dashboard.');
  }

  // ────────────────────────────────────────────────────────────────
  // Step 13: Final verification
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(13, TOTAL_STEPS, 'Final verification');

  if (verification.allHealthy) {
    ui.success('All services are healthy');
  } else {
    const unhealthy = verification.services.filter(s => !s.healthy);
    ui.warn(`${unhealthy.length} service(s) not yet healthy — they may still be starting:`);
    for (const s of unhealthy) {
      ui.substep(`${s.name}: ${s.error || 'unknown'}`);
    }
    ui.info('Services typically take 30-60 seconds to fully start.');
    ui.info('Check status: docker compose -f infra/docker-compose.yml ps');
  }

  // ────────────────────────────────────────────────────────────────
  // Step 14: Success summary
  // ────────────────────────────────────────────────────────────────
  ui.blank();
  ui.step(14, TOTAL_STEPS, 'Installation complete!');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  ui.successBox('🌽 Corn Hub is Ready!', [
    '',
    `${ui.colorize('Dashboard:', 'bold')}    http://localhost:3000`,
    `${ui.colorize('API:', 'bold')}          http://localhost:4000`,
    `${ui.colorize('MCP Server:', 'bold')}   http://localhost:8317/mcp`,
    `${ui.colorize('Qdrant:', 'bold')}       http://localhost:6333`,
    '',
    `${ui.colorize('Install Dir:', 'bold')}  ${installDir}`,
    `${ui.colorize('Elapsed:', 'bold')}      ${elapsed}s`,
    '',
    `${ui.colorize('IDEs:', 'bold')}         ${selectedIdes.length > 0 ? selectedIdes.join(', ') : 'none'}`,
    `${ui.colorize('MCP Tools:', 'bold')}    ${verification.mcpTools.toolCount || '?'} registered`,
    '',
    ui.colorize('Next Steps:', 'bold'),
    `  1. Open the Dashboard at http://localhost:3000`,
    `  2. Add a project and index your codebase`,
    `  3. Restart your IDE to load the MCP server`,
    `  4. Start coding with AI superpowers! ${ui.colorize('🌽', 'yellow')}`,
    '',
    ui.colorize('Commands:', 'bold'),
    ...(platform === 'win32' ? [
      `  ${ui.colorize('Start:', 'cyan')}   cd ${installDir}; .\\start.cmd up`,
      `  ${ui.colorize('Stop:', 'cyan')}    cd ${installDir}; .\\start.cmd down`,
      `  ${ui.colorize('Logs:', 'cyan')}    cd ${installDir}; .\\start.cmd logs`,
      `  ${ui.colorize('Status:', 'cyan')}  cd ${installDir}; .\\start.cmd status`,
    ] : [
      `  ${ui.colorize('Start:', 'cyan')}   cd ${installDir} && ./start.sh up`,
      `  ${ui.colorize('Stop:', 'cyan')}    cd ${installDir} && ./start.sh down`,
      `  ${ui.colorize('Logs:', 'cyan')}    cd ${installDir} && ./start.sh logs`,
      `  ${ui.colorize('Status:', 'cyan')}  cd ${installDir} && ./start.sh status`,
    ]),
  ]);

  ui.blank();
  ui.closePrompts();
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
    ${ui.colorize('(default)', 'cyan')}           Run the interactive installer
    ${ui.colorize('monitor', 'cyan')}             Start the live monitoring dashboard

  ${ui.colorize('OPTIONS', 'bold')}
    -h, --help           Show this help message
    -v, --version        Show version number

  ${ui.colorize('INSTALL MODE', 'bold')}
    1. Checks for Docker, Node.js, Git, pnpm
    2. Installs missing dependencies (with your permission)
    3. Clones the Corn Hub repository
    4. Configures Voyage AI API key for embeddings
    5. Builds and starts the Docker stack
    6. Configures your IDE (Antigravity, Claude Code, Cursor, VS Code, Codex, Windsurf)
    7. Verifies all 18 MCP tools are working

  ${ui.colorize('MONITOR MODE', 'bold')}
    Real-time terminal dashboard showing:
    • Live tool call activity feed
    • Per-tool performance analytics
    • Active sessions and quality scores
    • Service health and uptime

  ${ui.colorize('EXAMPLES', 'bold')}
    npx corn-install                    # Interactive installer
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
