// ─── Corn Hub CLI — Terminal UI Engine ───────────────────────────────
// Claude-Code-style rendering with pure ANSI escape codes
// Zero dependencies — Node.js built-in only

import * as readline from 'node:readline';

// ─── ANSI Color Codes ────────────────────────────────────────────
const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const ITALIC = `${ESC}3m`;
const UNDERLINE = `${ESC}4m`;

// Colors
const BLACK = `${ESC}30m`;
const RED = `${ESC}31m`;
const GREEN = `${ESC}32m`;
const YELLOW = `${ESC}33m`;
const BLUE = `${ESC}34m`;
const MAGENTA = `${ESC}35m`;
const CYAN = `${ESC}36m`;
const WHITE = `${ESC}37m`;

// Bright Colors
const BRIGHT_RED = `${ESC}91m`;
const BRIGHT_GREEN = `${ESC}92m`;
const BRIGHT_YELLOW = `${ESC}93m`;
const BRIGHT_BLUE = `${ESC}94m`;
const BRIGHT_MAGENTA = `${ESC}95m`;
const BRIGHT_CYAN = `${ESC}96m`;
const BRIGHT_WHITE = `${ESC}97m`;

// Background
const BG_BLACK = `${ESC}40m`;
const BG_RED = `${ESC}41m`;
const BG_GREEN = `${ESC}42m`;
const BG_YELLOW = `${ESC}43m`;
const BG_BLUE = `${ESC}44m`;
const BG_MAGENTA = `${ESC}45m`;
const BG_CYAN = `${ESC}46m`;

// Cursor control
const HIDE_CURSOR = `${ESC}?25l`;
const SHOW_CURSOR = `${ESC}?25h`;
const CLEAR_LINE = `${ESC}2K`;
const MOVE_UP = (n: number) => `${ESC}${n}A`;
const MOVE_COL = (n: number) => `${ESC}${n}G`;

// ─── Symbols ─────────────────────────────────────────────────────
const SYM = {
  check: '✓',
  cross: '✗',
  warning: '⚠',
  arrow: '→',
  dot: '●',
  circle: '○',
  corn: '🌽',
  rocket: '🚀',
  gear: '⚙',
  key: '🔑',
  docker: '🐳',
  folder: '📁',
  plug: '🔌',
  shield: '🛡',
  sparkle: '✨',
  magnify: '🔍',
  package: '📦',
  checkBox: '☑',
  emptyBox: '☐',
  radio: '◉',
  radioEmpty: '○',
  pipe: '│',
  pipeEnd: '└',
  pipeT: '├',
  pipeLine: '─',
};

// ─── Spinner Frames (Claude Code style: ping-pong through symbols) ─
const _SPIN_BASE = ['·', '✢', '*', '✶', '✻', '✽'];
const SPINNER_FRAMES = [..._SPIN_BASE, ...[..._SPIN_BASE].reverse()];
const PROGRESS_CHARS = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

// ─── Gradient maker ──────────────────────────────────────────────
function rgb(r: number, g: number, b: number): string {
  return `${ESC}38;2;${r};${g};${b}m`;
}

function bgRgb(r: number, g: number, b: number): string {
  return `${ESC}48;2;${r};${g};${b}m`;
}

function gradient(text: string, startR: number, startG: number, startB: number, endR: number, endG: number, endB: number): string {
  const chars = [...text];
  const len = chars.length || 1;
  return chars.map((ch, i) => {
    const ratio = i / len;
    const r = Math.round(startR + (endR - startR) * ratio);
    const g = Math.round(startG + (endG - startG) * ratio);
    const b = Math.round(startB + (endB - startB) * ratio);
    return `${rgb(r, g, b)}${ch}`;
  }).join('') + RESET;
}

// ─── Core Output Functions ───────────────────────────────────────
const out = process.stdout;

function write(s: string): void {
  out.write(s);
}

function writeln(s: string = ''): void {
  out.write(s + '\n');
}

function clearCurrentLine(): void {
  write(`\r${CLEAR_LINE}`);
}

// ─── Public UI API ───────────────────────────────────────────────

// ─── Clawd Mascot — exact replica of Claude Code's Clawd character ─
// Colors: clawd_body = rgb(215,119,87)  clawd_background = rgb(0,0,0)
const _O = rgb(215, 119, 87);       // Claude orange
const _OB = bgRgb(0, 0, 0);         // Black body background

// default pose  — arms at sides, pupils bottom (▛/▜)
const MASCOT_DEFAULT = [
  ` ${_O}▐${RESET}${_O}${_OB}▛███▜${RESET}${_O}▌${RESET}`,
  `${_O}▝▜${RESET}${_O}${_OB}█████${RESET}${_O}▛▘${RESET}`,
  `${_O}  ▘▘ ▝▝  ${RESET}`,
];

// arms-up pose  — raised arms (used for "happy" / startup greeting)
const MASCOT_HAPPY = [
  `${_O}▗▟${RESET}${_O}${_OB}▛███▜${RESET}${_O}▙▖${RESET}`,
  ` ${_O}▜${RESET}${_O}${_OB}█████${RESET}${_O}▛ ${RESET}`,
  `${_O}  ▘▘ ▝▝  ${RESET}`,
];

export type MascotPose = 'default' | 'happy';

export function cornMascot(pose: MascotPose = 'default'): string[] {
  return pose === 'happy' ? MASCOT_HAPPY : MASCOT_DEFAULT;
}

export function banner(): void {
  // Claude Code CondensedLogo style:
  // [Clawd 3-row mascot]  [App name + version]
  //                       [subtitle]
  //                       [cwd]
  const mascot = cornMascot('happy');   // arms-up pose on startup
  const cwd = process.cwd();
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const displayCwd = home && cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
  const maxCwd = Math.max((process.stdout.columns || 80) - 18, 20);
  const truncatedCwd = displayCwd.length > maxCwd
    ? '…' + displayCwd.slice(-(maxCwd - 1))
    : displayCwd;

  const info = [
    `${BOLD}CornMCP${RESET} ${DIM}v0.4.0${RESET}`,
    `${DIM}AI Agent Intelligence Platform${RESET}`,
    `${DIM}${truncatedCwd}${RESET}`,
  ];

  writeln();
  for (let i = 0; i < mascot.length; i++) {
    writeln(`${mascot[i]}  ${info[i] ?? ''}`);
  }
  writeln();
}

export function step(n: number, total: number, message: string): void {
  const padded = String(n).padStart(2, ' ');
  const tag = `${DIM}${BRIGHT_WHITE}[${padded}/${total}]${RESET}`;
  writeln(`${tag} ${BOLD}${BRIGHT_CYAN}${message}${RESET}`);
}

export function substep(message: string): void {
  writeln(`      ${DIM}${SYM.pipeT}${SYM.pipeLine}${RESET} ${message}`);
}

export function success(message: string): void {
  writeln(`  ${BOLD}${BRIGHT_GREEN}${SYM.check}${RESET} ${GREEN}${message}${RESET}`);
}

export function error(message: string): void {
  writeln(`  ${BOLD}${BRIGHT_RED}${SYM.cross}${RESET} ${RED}${message}${RESET}`);
}

export function warn(message: string): void {
  writeln(`  ${BOLD}${BRIGHT_YELLOW}${SYM.warning}${RESET} ${YELLOW}${message}${RESET}`);
}

export function info(message: string): void {
  writeln(`  ${BRIGHT_BLUE}ℹ${RESET} ${DIM}${message}${RESET}`);
}

export function divider(): void {
  const width = Math.min(process.stdout.columns || 80, 80);
  writeln(`  ${DIM}${'─'.repeat(width - 4)}${RESET}`);
}

export function blank(): void {
  writeln();
}

export function box(title: string, lines: string[]): void {
  const width = Math.min(process.stdout.columns || 80, 72);
  const innerW = width - 4;
  const top = `  ${DIM}╭${'─'.repeat(innerW + 2)}╮${RESET}`;
  const bottom = `  ${DIM}╰${'─'.repeat(innerW + 2)}╯${RESET}`;
  const titleLine = `  ${DIM}│${RESET} ${BOLD}${BRIGHT_WHITE}${title.padEnd(innerW)}${RESET} ${DIM}│${RESET}`;
  const sep = `  ${DIM}├${'─'.repeat(innerW + 2)}┤${RESET}`;

  writeln(top);
  writeln(titleLine);
  writeln(sep);
  for (const line of lines) {
    const stripped = stripAnsi(line);
    const pad = Math.max(0, innerW - stripped.length);
    writeln(`  ${DIM}│${RESET} ${line}${' '.repeat(pad)} ${DIM}│${RESET}`);
  }
  writeln(bottom);
}

export function table(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => {
    const values = rows.map(r => stripAnsi(r[i] || '').length);
    return Math.max(stripAnsi(h).length, ...values);
  });

  const headerLine = headers.map((h, i) => `${BOLD}${BRIGHT_WHITE}${h.padEnd(colWidths[i])}${RESET}`).join('  ');
  writeln(`  ${headerLine}`);
  writeln(`  ${colWidths.map(w => '─'.repeat(w)).join('──')}`);
  for (const row of rows) {
    const line = row.map((cell, i) => {
      const stripped = stripAnsi(cell);
      const pad = Math.max(0, colWidths[i] - stripped.length);
      return cell + ' '.repeat(pad);
    }).join('  ');
    writeln(`  ${line}`);
  }
}

// ─── Animated Spinner ────────────────────────────────────────────
export interface SpinnerHandle {
  stop: (finalMessage?: string) => void;
  update: (message: string) => void;
}

export function spinner(message: string): SpinnerHandle {
  let frame = 0;
  let currentMsg = message;
  const start = Date.now();

  write(HIDE_CURSOR);

  const interval = setInterval(() => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const spin = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
    clearCurrentLine();
    write(`  ${_O}${spin}${RESET} ${currentMsg} ${DIM}(${elapsed}s)${RESET}`);
    frame++;
  }, 50);

  return {
    update(msg: string) {
      currentMsg = msg;
    },
    stop(finalMessage?: string) {
      clearInterval(interval);
      clearCurrentLine();
      write(SHOW_CURSOR);
      if (finalMessage) {
        writeln(`  ${BOLD}${BRIGHT_GREEN}${SYM.check}${RESET} ${GREEN}${finalMessage}${RESET}`);
      }
    },
  };
}

// ─── Thinking Animation ─────────────────────────────────────────
export function thinking(message: string): SpinnerHandle {
  let frame = 0;
  let currentMsg = message;
  const thoughts = [
    'analyzing context...',
    'processing request...',
    'gathering information...',
    'evaluating options...',
    'preparing response...',
  ];

  write(HIDE_CURSOR);

  const interval = setInterval(() => {
    const spin = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
    const thought = thoughts[Math.floor(frame / 10) % thoughts.length];
    clearCurrentLine();
    write(`  ${_O}${spin}${RESET} ${ITALIC}${DIM}${currentMsg}${RESET} ${DIM}— ${thought}${RESET}`);
    frame++;
  }, 50);

  return {
    update(msg: string) {
      currentMsg = msg;
    },
    stop(finalMessage?: string) {
      clearInterval(interval);
      clearCurrentLine();
      write(SHOW_CURSOR);
      if (finalMessage) {
        writeln(`  ${BOLD}${BRIGHT_GREEN}${SYM.check}${RESET} ${GREEN}${finalMessage}${RESET}`);
      }
    },
  };
}

// ─── Progress Bar ────────────────────────────────────────────────
export function progressBar(current: number, total: number, label: string, width: number = 30): void {
  const pct = Math.min(current / total, 1);
  const filled = Math.floor(pct * width);
  const partial = Math.floor((pct * width - filled) * 8);

  let bar = '█'.repeat(filled);
  if (filled < width && partial > 0) {
    bar += PROGRESS_CHARS[partial - 1];
  }
  bar += '░'.repeat(Math.max(0, width - bar.length));

  const pctStr = `${Math.round(pct * 100)}%`.padStart(4);

  clearCurrentLine();
  write(`  ${BRIGHT_CYAN}${bar}${RESET} ${BOLD}${pctStr}${RESET} ${DIM}${label}${RESET}`);
}

// ─── Interactive Prompts ─────────────────────────────────────────
let rl: readline.Interface | null = null;

function getRl(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
  }
  return rl;
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    getRl().question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

export async function prompt(question: string, defaultVal?: string): Promise<string> {
  const def = defaultVal ? ` ${DIM}(${defaultVal})${RESET}` : '';
  const answer = await ask(`  ${BRIGHT_CYAN}?${RESET} ${BOLD}${question}${RESET}${def}${BRIGHT_CYAN} › ${RESET}`);
  return answer || defaultVal || '';
}

export async function promptSecret(question: string): Promise<string> {
  // Pause the readline interface so it doesn't compete for stdin
  const rlInst = getRl();
  rlInst.pause();

  return new Promise((resolve) => {
    write(`  ${BRIGHT_CYAN}${SYM.key}${RESET} ${BOLD}${question}${RESET}${BRIGHT_CYAN} › ${RESET}`);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    let value = '';

    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (stdin.isTTY && wasRaw !== undefined) {
        stdin.setRawMode(wasRaw);
      }
      // Resume readline
      rlInst.resume();
    };

    const onData = (buf: Buffer) => {
      const ch = buf.toString('utf-8');

      if (ch === '\r' || ch === '\n') {
        cleanup();
        writeln();
        resolve(value);
        return;
      }

      if (ch === '\x7f' || ch === '\b') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          write('\b \b');
        }
        return;
      }

      if (ch === '\x03') {
        cleanup();
        writeln();
        process.exit(130);
        return;
      }

      value += ch;
      if (value.length <= 3) {
        write(ch);
      } else {
        write('•');
      }
    };

    stdin.on('data', onData);
  });
}

export async function confirm(question: string, defaultYes: boolean = true): Promise<boolean> {
  const hint = defaultYes ? `${GREEN}Y${RESET}/${DIM}n${RESET}` : `${DIM}y${RESET}/${GREEN}N${RESET}`;
  const answer = await ask(`  ${BRIGHT_CYAN}?${RESET} ${BOLD}${question}${RESET} (${hint})${BRIGHT_CYAN} › ${RESET}`);

  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

export async function select(question: string, options: { label: string; value: string; hint?: string }[]): Promise<string> {
  writeln(`  ${BRIGHT_CYAN}?${RESET} ${BOLD}${question}${RESET}`);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const num = `${BRIGHT_CYAN}${i + 1}${RESET}`;
    const hint = opt.hint ? ` ${DIM}— ${opt.hint}${RESET}` : '';
    writeln(`    ${num}) ${opt.label}${hint}`);
  }

  const answer = await ask(`  ${BRIGHT_CYAN}›${RESET} Enter number: `);
  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < options.length) {
    return options[idx].value;
  }
  // Default to first
  return options[0].value;
}

export async function multiSelect(question: string, options: { label: string; value: string; hint?: string; checked?: boolean }[]): Promise<string[]> {
  writeln(`  ${BRIGHT_CYAN}?${RESET} ${BOLD}${question}${RESET} ${DIM}(comma-separated numbers, or 'a' for all)${RESET}`);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const num = `${BRIGHT_CYAN}${i + 1}${RESET}`;
    const box = opt.checked ? `${GREEN}${SYM.checkBox}${RESET}` : `${DIM}${SYM.emptyBox}${RESET}`;
    const hint = opt.hint ? ` ${DIM}— ${opt.hint}${RESET}` : '';
    writeln(`    ${num}) ${box} ${opt.label}${hint}`);
  }

  const answer = await ask(`  ${BRIGHT_CYAN}›${RESET} Your choices: `);

  if (answer.toLowerCase() === 'a' || answer.toLowerCase() === 'all') {
    return options.map(o => o.value);
  }

  const indices = answer.split(/[,\s]+/).map(s => parseInt(s.trim(), 10) - 1);
  return indices
    .filter(i => i >= 0 && i < options.length)
    .map(i => options[i].value);
}

export function closePrompts(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}

// ─── Summary Boxes ───────────────────────────────────────────────
export function successBox(title: string, lines: string[]): void {
  const width = Math.min(process.stdout.columns || 80, 72);
  const innerW = width - 4;
  const top = `  ${GREEN}╭${'─'.repeat(innerW + 2)}╮${RESET}`;
  const bottom = `  ${GREEN}╰${'─'.repeat(innerW + 2)}╯${RESET}`;
  const titleLine = `  ${GREEN}│${RESET} ${BOLD}${BRIGHT_GREEN}${SYM.check} ${title.padEnd(innerW - 2)}${RESET} ${GREEN}│${RESET}`;
  const sep = `  ${GREEN}├${'─'.repeat(innerW + 2)}┤${RESET}`;

  writeln(top);
  writeln(titleLine);
  writeln(sep);
  for (const line of lines) {
    const stripped = stripAnsi(line);
    const pad = Math.max(0, innerW - stripped.length);
    writeln(`  ${GREEN}│${RESET} ${line}${' '.repeat(pad)} ${GREEN}│${RESET}`);
  }
  writeln(bottom);
}

export function errorBox(title: string, lines: string[]): void {
  const width = Math.min(process.stdout.columns || 80, 72);
  const innerW = width - 4;
  const top = `  ${RED}╭${'─'.repeat(innerW + 2)}╮${RESET}`;
  const bottom = `  ${RED}╰${'─'.repeat(innerW + 2)}╯${RESET}`;
  const titleLine = `  ${RED}│${RESET} ${BOLD}${BRIGHT_RED}${SYM.cross} ${title.padEnd(innerW - 2)}${RESET} ${RED}│${RESET}`;
  const sep = `  ${RED}├${'─'.repeat(innerW + 2)}┤${RESET}`;

  writeln(top);
  writeln(titleLine);
  writeln(sep);
  for (const line of lines) {
    const stripped = stripAnsi(line);
    const pad = Math.max(0, innerW - stripped.length);
    writeln(`  ${RED}│${RESET} ${line}${' '.repeat(pad)} ${RED}│${RESET}`);
  }
  writeln(bottom);
}

// ─── Helpers ─────────────────────────────────────────────────────
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export function colorize(text: string, color: 'green' | 'red' | 'yellow' | 'cyan' | 'magenta' | 'blue' | 'dim' | 'bold' | 'white'): string {
  const colors: Record<string, string> = {
    green: BRIGHT_GREEN,
    red: BRIGHT_RED,
    yellow: BRIGHT_YELLOW,
    cyan: BRIGHT_CYAN,
    magenta: BRIGHT_MAGENTA,
    blue: BRIGHT_BLUE,
    dim: DIM,
    bold: BOLD + BRIGHT_WHITE,
    white: BRIGHT_WHITE,
  };
  return `${colors[color] || ''}${text}${RESET}`;
}

// ─── Screen Control ──────────────────────────────────────────────
export function clearScreen(): void {
  write(`${ESC}2J${ESC}H`);
}

// ─── Interactive Menu ────────────────────────────────────────────
export async function menu(title: string, options: { key: string; label: string; hint?: string }[]): Promise<string> {
  writeln();
  writeln(`  ${BOLD}${BRIGHT_CYAN}${title}${RESET}`);
  writeln(`  ${DIM}${'─'.repeat(Math.min(process.stdout.columns || 80, 60))}${RESET}`);
  writeln();

  for (const opt of options) {
    const keyStr = `${BRIGHT_CYAN}${BOLD}${opt.key}${RESET}`;
    const hint = opt.hint ? ` ${DIM}— ${opt.hint}${RESET}` : '';
    writeln(`    ${keyStr}  ${opt.label}${hint}`);
  }

  writeln();
  const answer = await ask(`  ${BRIGHT_CYAN}›${RESET} ${BOLD}Choose an option:${RESET} `);
  return answer.trim().toLowerCase();
}

// ─── Wait for Enter ──────────────────────────────────────────────
export async function waitForEnter(): Promise<void> {
  await ask(`\n  ${DIM}Press Enter to return to menu...${RESET}`);
}

// ─── Horizontal Rule ─────────────────────────────────────────────
export function hr(): void {
  const width = Math.min(process.stdout.columns || 80, 72);
  writeln(`  ${DIM}${'─'.repeat(width - 4)}${RESET}`);
}
