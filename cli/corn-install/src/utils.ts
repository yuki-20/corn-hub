// ─── Corn Hub CLI — Shared Utilities ─────────────────────────────
// Cross-platform helpers using only Node.js built-ins

import { execSync, exec as execCb } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir, platform, arch } from 'node:os';
import { join, dirname } from 'node:path';

export type Platform = 'win32' | 'darwin' | 'linux';

export function getPlatform(): Platform {
  const p = platform();
  if (p === 'win32' || p === 'darwin' || p === 'linux') return p;
  return 'linux'; // fallback
}

export function getArch(): string {
  return arch();
}

export function getHomeDir(): string {
  return homedir();
}

export function pathExists(p: string): boolean {
  return existsSync(p);
}

export function ensureDir(p: string): void {
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
  }
}

export function readTextFile(p: string): string {
  return readFileSync(p, 'utf-8');
}

export function writeTextFile(p: string, content: string): void {
  ensureDir(dirname(p));
  writeFileSync(p, content, 'utf-8');
}

export function readJson(p: string): any {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeJson(p: string, data: any): void {
  ensureDir(dirname(p));
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ─── Command Execution ──────────────────────────────────────────
export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function execSync_(cmd: string, timeoutMs: number = 30000): ExecResult {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
    return { ok: true, stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      ok: false,
      stdout: (err.stdout || '').toString().trim(),
      stderr: (err.stderr || '').toString().trim(),
      exitCode: err.status ?? 1,
    };
  }
}

export function execAsync(cmd: string, cwd?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    execCb(cmd, {
      encoding: 'utf-8',
      timeout: 300000, // 5 min
      cwd,
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
        exitCode: error?.code ? Number(error.code) : (error ? 1 : 0),
      });
    });
  });
}

export function execStream(cmd: string, cwd?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execCb(cmd, {
      encoding: 'utf-8',
      cwd,
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
        exitCode: error?.code ? Number(error.code) : (error ? 1 : 0),
      });
    });

    // Pipe output to stderr so user can see build progress
    child.stdout?.pipe(process.stderr);
    child.stderr?.pipe(process.stderr);
  });
}

// ─── Misc Helpers ────────────────────────────────────────────────
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseVersion(versionString: string): number[] {
  const match = versionString.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3] || '0')];
}

export function versionGte(version: string, required: string): boolean {
  const v = parseVersion(version);
  const r = parseVersion(required);
  for (let i = 0; i < 3; i++) {
    if (v[i] > r[i]) return true;
    if (v[i] < r[i]) return false;
  }
  return true; // equal
}

import { randomBytes } from 'node:crypto';

export function randomHexSync(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

export function resolveHome(filepath: string): string {
  if (filepath.startsWith('~')) {
    return join(homedir(), filepath.slice(1));
  }
  return filepath;
}

// ─── TOML Helpers (minimal for Codex config) ─────────────────────
export function readTomlSection(content: string, section: string): Record<string, string> | null {
  const sectionPattern = new RegExp(`\\[${section.replace(/\./g, '\\.')}\\]`);
  const match = content.match(sectionPattern);
  if (!match) return null;

  const result: Record<string, string> = {};
  const afterSection = content.slice(match.index! + match[0].length);
  const lines = afterSection.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) break; // next section
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function appendTomlSection(existingContent: string, section: string, entries: Record<string, string | string[]>): string {
  // Remove existing section if present
  const sectionPattern = new RegExp(`\\[${section.replace(/\./g, '\\.')}\\][\\s\\S]*?(?=\\n\\[|$)`);
  let content = existingContent.replace(sectionPattern, '').trim();

  // Add new section
  content += `\n\n[${section}]\n`;
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      content += `${key} = [${value.map(v => `"${v}"`).join(', ')}]\n`;
    } else {
      content += `${key} = "${value}"\n`;
    }
  }

  return content;
}
