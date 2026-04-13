// ─── Corn Hub CLI — Dependency Detection ─────────────────────────
// Checks for Docker, Node.js, pnpm, Git on any OS

import { execSync_, getPlatform, versionGte, type Platform } from './utils.js';

export interface CheckResult {
  name: string;
  found: boolean;
  version?: string;
  path?: string;
  required: string;
  meetsMinimum: boolean;
  installHint: Record<Platform, string>;
}

// ─── Individual Checks ──────────────────────────────────────────

export function checkDocker(): CheckResult {
  const result = execSync_('docker --version');
  const version = result.stdout.match(/(\d+\.\d+\.\d+)/)?.[1] || '';

  return {
    name: 'Docker',
    found: result.ok && !!version,
    version,
    required: '20.0.0',
    meetsMinimum: result.ok && versionGte(version, '20.0.0'),
    installHint: {
      win32: 'winget install Docker.DockerDesktop',
      darwin: 'brew install --cask docker',
      linux: 'curl -fsSL https://get.docker.com | sh',
    },
  };
}

export function checkDockerCompose(): CheckResult {
  // Try v2 first (docker compose), then v1 (docker-compose)
  let result = execSync_('docker compose version');
  if (!result.ok) {
    result = execSync_('docker-compose --version');
  }
  const version = result.stdout.match(/(\d+\.\d+\.\d+)/)?.[1] || '';

  return {
    name: 'Docker Compose',
    found: result.ok && !!version,
    version,
    required: '2.0.0',
    meetsMinimum: result.ok && versionGte(version, '2.0.0'),
    installHint: {
      win32: 'Included with Docker Desktop',
      darwin: 'Included with Docker Desktop',
      linux: 'apt install docker-compose-plugin',
    },
  };
}

export function checkDockerRunning(): CheckResult {
  const result = execSync_('docker info', 5000);

  return {
    name: 'Docker Daemon',
    found: result.ok,
    version: result.ok ? 'running' : 'not running',
    required: 'running',
    meetsMinimum: result.ok,
    installHint: {
      win32: 'Start Docker Desktop from the Start menu',
      darwin: 'Open Docker Desktop from Applications',
      linux: 'sudo systemctl start docker',
    },
  };
}

export function checkNode(): CheckResult {
  const result = execSync_('node --version');
  const version = result.stdout.replace(/^v/, '').trim();

  return {
    name: 'Node.js',
    found: result.ok && !!version,
    version,
    required: '22.0.0',
    meetsMinimum: result.ok && versionGte(version, '22.0.0'),
    installHint: {
      win32: 'winget install OpenJS.NodeJS.LTS',
      darwin: 'brew install node@22',
      linux: 'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs',
    },
  };
}

export function checkPnpm(): CheckResult {
  const result = execSync_('pnpm --version');
  const version = result.stdout.trim();

  return {
    name: 'pnpm',
    found: result.ok && !!version,
    version,
    required: '10.0.0',
    meetsMinimum: result.ok && versionGte(version, '10.0.0'),
    installHint: {
      win32: 'npm install -g pnpm@latest',
      darwin: 'npm install -g pnpm@latest',
      linux: 'npm install -g pnpm@latest',
    },
  };
}

export function checkGit(): CheckResult {
  const result = execSync_('git --version');
  const version = result.stdout.match(/(\d+\.\d+\.\d+)/)?.[1] || '';

  return {
    name: 'Git',
    found: result.ok && !!version,
    version,
    required: '2.0.0',
    meetsMinimum: result.ok && versionGte(version, '2.0.0'),
    installHint: {
      win32: 'winget install Git.Git',
      darwin: 'brew install git',
      linux: 'sudo apt install -y git',
    },
  };
}

// ─── Run All Checks ──────────────────────────────────────────────

export interface SystemCheck {
  platform: Platform;
  checks: CheckResult[];
  allMet: boolean;
  criticalMissing: CheckResult[];
  optionalMissing: CheckResult[];
}

const CRITICAL_DEPS = ['Docker', 'Docker Compose', 'Docker Daemon', 'Node.js', 'Git'];
const OPTIONAL_DEPS = ['pnpm'];

export function runAllChecks(): SystemCheck {
  const plat = getPlatform();
  const checks = [
    checkDocker(),
    checkDockerCompose(),
    checkDockerRunning(),
    checkNode(),
    checkGit(),
    checkPnpm(),
  ];

  const criticalMissing = checks.filter(c => CRITICAL_DEPS.includes(c.name) && !c.meetsMinimum);
  const optionalMissing = checks.filter(c => OPTIONAL_DEPS.includes(c.name) && !c.meetsMinimum);

  return {
    platform: plat,
    checks,
    allMet: criticalMissing.length === 0,
    criticalMissing,
    optionalMissing,
  };
}
