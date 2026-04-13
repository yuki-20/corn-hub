// ─── Corn Hub CLI — Dependency Installer ─────────────────────────
// Auto-install missing prerequisites with user confirmation

import { getPlatform, execAsync, execStream, type Platform } from './utils.js';
import * as ui from './ui.js';
import type { CheckResult } from './detector.js';

export async function installMissing(missing: CheckResult[]): Promise<boolean> {
  if (missing.length === 0) return true;

  const platform = getPlatform();

  ui.blank();
  ui.warn('The following dependencies are missing or outdated:');
  ui.blank();

  for (const dep of missing) {
    const status = dep.found
      ? `${ui.colorize(dep.version || '?', 'yellow')} (need ${dep.required}+)`
      : ui.colorize('not found', 'red');
    ui.substep(`${ui.colorize(dep.name, 'bold')}: ${status}`);
  }

  ui.blank();
  const shouldInstall = await ui.confirm('Would you like me to install them for you?');

  if (!shouldInstall) {
    ui.blank();
    ui.info('Please install them manually and re-run the installer.');
    ui.blank();
    ui.box('Manual Installation Commands', missing.map(dep => {
      const cmd = dep.installHint[platform];
      return `${ui.colorize(dep.name, 'cyan')}: ${ui.colorize(cmd, 'dim')}`;
    }));
    return false;
  }

  ui.blank();

  for (const dep of missing) {
    await installDep(dep, platform);
  }

  return true;
}

async function installDep(dep: CheckResult, platform: Platform): Promise<void> {
  const cmd = dep.installHint[platform];

  if (!cmd || cmd.startsWith('Included')) {
    ui.warn(`${dep.name}: ${cmd || 'No auto-install available for your platform'}`);
    return;
  }

  // Special cases
  if (dep.name === 'Docker Daemon') {
    ui.info(`Starting Docker...`);
    if (platform === 'win32') {
      const sp = ui.spinner('Starting Docker Desktop...');
      const result = await execAsync('start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"');
      if (!result.ok) {
        sp.stop();
        ui.warn('Could not auto-start Docker Desktop. Please start it manually.');
        ui.info('Open Docker Desktop from the Start menu, then re-run this installer.');
        return;
      }
      // Wait for Docker daemon to be ready
      let ready = false;
      for (let i = 0; i < 30; i++) {
        sp.update(`Waiting for Docker daemon to start... (${i * 2}s)`);
        await new Promise(r => setTimeout(r, 2000));
        const check = await execAsync('docker info');
        if (check.ok) {
          ready = true;
          break;
        }
      }
      sp.stop(ready ? 'Docker Desktop is running' : undefined);
      if (!ready) {
        ui.warn('Docker is taking too long to start. Please wait and retry.');
      }
    } else if (platform === 'darwin') {
      const sp = ui.spinner('Starting Docker Desktop...');
      await execAsync('open -a Docker');
      let ready = false;
      for (let i = 0; i < 30; i++) {
        sp.update(`Waiting for Docker daemon... (${i * 2}s)`);
        await new Promise(r => setTimeout(r, 2000));
        const check = await execAsync('docker info');
        if (check.ok) {
          ready = true;
          break;
        }
      }
      sp.stop(ready ? 'Docker Desktop is running' : undefined);
    } else {
      const sp = ui.spinner('Starting Docker service...');
      const result = await execAsync('sudo systemctl start docker');
      sp.stop(result.ok ? 'Docker daemon started' : undefined);
      if (!result.ok) {
        ui.warn('Could not start Docker. Try: sudo systemctl start docker');
      }
    }
    return;
  }

  // Normal installation
  ui.info(`Installing ${dep.name}...`);
  ui.substep(`Running: ${ui.colorize(cmd, 'dim')}`);

  const sp = ui.spinner(`Installing ${dep.name}...`);

  // For Docker and Node on Windows, use winget which needs special handling
  const needsElevation = platform === 'win32' && (dep.name === 'Docker' || dep.name === 'Node.js' || dep.name === 'Git');

  let result;
  if (needsElevation) {
    // On Windows, winget may need user interaction
    sp.stop();
    ui.info('This may require administrator privileges and user interaction.');
    result = await execStream(cmd);
  } else {
    result = await execAsync(cmd);
    sp.stop();
  }

  if (result.ok) {
    ui.success(`${dep.name} installed successfully`);
  } else {
    ui.error(`Failed to install ${dep.name}`);
    if (result.stderr) {
      ui.substep(ui.colorize(result.stderr.slice(0, 200), 'dim'));
    }
    ui.info(`Try manually: ${cmd}`);
  }
}
