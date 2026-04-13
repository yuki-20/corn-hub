import { join } from 'node:path';
import { unlinkSync } from 'node:fs';
import { getPlatform, pathExists, writeTextFile, execSync_, execAsync, sleep } from './utils.js';
import * as ui from './ui.js';

const TASK_NAME = 'CornMCP_Autolaunch';
const BAT_FILE = 'autolaunch-services.bat';
const VBS_FILE = 'autolaunch-services.vbs';
const XML_FILE = 'autolaunch-task.xml';
const API_PORT = 4000;
const MCP_PORT = 8317;

export interface AutolaunchStatus {
  supported: boolean;
  enabled: boolean;
  taskName: string;
  detail: string;
}

function isPortInUse(port: number): boolean {
  const result = execSync_(`netstat -aon | findstr ":${port} "`, 3000);
  return result.ok && result.stdout.includes('LISTENING');
}

export function getAutolaunchStatus(): AutolaunchStatus {
  if (getPlatform() !== 'win32') {
    return { supported: false, enabled: false, taskName: TASK_NAME, detail: 'Windows only' };
  }

  const result = execSync_(`schtasks /Query /TN "${TASK_NAME}" /FO CSV /NH`, 5000);
  if (!result.ok) {
    return { supported: true, enabled: false, taskName: TASK_NAME, detail: 'Not configured' };
  }

  const line = result.stdout.split('\n')[0] || '';
  const enabled = !line.toLowerCase().includes('disabled');
  return { supported: true, enabled, taskName: TASK_NAME, detail: enabled ? 'Active' : 'Disabled' };
}

function generateBatContent(installDir: string): string {
  const dir = installDir.replace(/\//g, '\\');
  return `@echo off
cd /d "${dir}"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":${API_PORT} " ^| findstr "LISTENING"') do (
    echo CornMCP already running on port ${API_PORT}, exiting.
    exit /b 0
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":${MCP_PORT} " ^| findstr "LISTENING"') do (
    echo CornMCP already running on port ${MCP_PORT}, exiting.
    exit /b 0
)

if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        if not "%%a"=="" (
            echo %%a | findstr /r "^#" >nul 2>&1
            if errorlevel 1 set "%%a=%%b"
        )
    )
)

start "" /min node apps\\corn-api\\dist\\index.js
timeout /t 4 /nobreak >nul
start "" /min node apps\\corn-mcp\\dist\\node.js
`;
}

function generateVbsContent(installDir: string): string {
  const dir = installDir.replace(/\//g, '\\');
  return `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${dir}"
WshShell.Run "cmd /c """ & "${dir}\\${BAT_FILE}" & """", 0, False
`;
}

function generateTaskXml(installDir: string): string {
  const vbsPath = join(installDir, VBS_FILE).replace(/\//g, '\\');
  const dir = installDir.replace(/\//g, '\\');
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Start CornMCP services at logon</Description>
    <Author>CornMCP</Author>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled></LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>"${vbsPath}"</Arguments>
      <WorkingDirectory>${dir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;
}

function removeFile(path: string): void {
  if (pathExists(path)) {
    try { unlinkSync(path); } catch { /* skip */ }
  }
}

async function createTaskElevated(xmlPath: string): Promise<boolean> {
  const escaped = xmlPath.replace(/\\/g, '\\\\');
  const cmd = `powershell -NoProfile -Command "Start-Process schtasks -ArgumentList '/Create','/TN','${TASK_NAME}','/XML','${escaped}','/F' -Verb RunAs -Wait"`;
  await execAsync(cmd);
  return execSync_(`schtasks /Query /TN "${TASK_NAME}" /FO CSV /NH`, 5000).ok;
}

async function deleteTaskElevated(): Promise<boolean> {
  const cmd = `powershell -NoProfile -Command "Start-Process schtasks -ArgumentList '/Delete','/TN','${TASK_NAME}','/F' -Verb RunAs -Wait"`;
  await execAsync(cmd);
  return !execSync_(`schtasks /Query /TN "${TASK_NAME}" /FO CSV /NH`, 5000).ok;
}

export async function enableAutolaunch(installDir: string): Promise<boolean> {
  if (getPlatform() !== 'win32') {
    ui.warn('Autolaunch is only supported on Windows.');
    return false;
  }

  const apiDist = join(installDir, 'apps', 'corn-api', 'dist', 'index.js');
  const mcpDist = join(installDir, 'apps', 'corn-mcp', 'dist', 'node.js');

  if (!pathExists(apiDist) || !pathExists(mcpDist)) {
    ui.error('Built files not found. Run "pnpm build" first.');
    return false;
  }

  writeTextFile(join(installDir, BAT_FILE), generateBatContent(installDir));
  ui.success(`Generated ${BAT_FILE}`);

  writeTextFile(join(installDir, VBS_FILE), generateVbsContent(installDir));
  ui.success(`Generated ${VBS_FILE}`);

  const xmlPath = join(installDir, XML_FILE);
  writeTextFile(xmlPath, generateTaskXml(installDir));

  ui.blank();
  ui.info('A Windows UAC prompt will appear — click "Yes" to allow.');
  const sp = ui.spinner('Creating scheduled task...');
  const success = await createTaskElevated(xmlPath);
  sp.stop();

  removeFile(xmlPath);

  if (!success) {
    ui.error('Failed to create scheduled task.');
    ui.info('The UAC prompt may have been declined.');
    return false;
  }

  ui.success('Scheduled task created');
  ui.blank();
  ui.successBox('Autolaunch Enabled', [
    '',
    `  ${ui.colorize('Task:', 'bold')}       ${TASK_NAME}`,
    `  ${ui.colorize('Trigger:', 'bold')}    At logon (current user)`,
    `  ${ui.colorize('Services:', 'bold')}   corn-api (:${API_PORT}) + corn-mcp (:${MCP_PORT})`,
    `  ${ui.colorize('Restart:', 'bold')}    Up to 3 retries on failure (1 min interval)`,
    '',
  ]);

  return true;
}

export async function disableAutolaunch(installDir: string): Promise<boolean> {
  if (getPlatform() !== 'win32') {
    ui.warn('Autolaunch is only supported on Windows.');
    return false;
  }

  ui.info('A Windows UAC prompt may appear — click "Yes" to allow.');
  const sp = ui.spinner('Removing scheduled task...');
  const success = await deleteTaskElevated();
  sp.stop();

  if (!success) {
    ui.warn('Could not remove scheduled task. The UAC prompt may have been declined.');
  } else {
    ui.success('Scheduled task removed');
  }

  removeFile(join(installDir, BAT_FILE));
  removeFile(join(installDir, VBS_FILE));
  removeFile(join(installDir, XML_FILE));

  ui.blank();
  ui.success('Autolaunch disabled.');
  return true;
}

async function testAutolaunch(installDir: string): Promise<void> {
  const batPath = join(installDir, BAT_FILE);

  if (!pathExists(batPath)) {
    ui.warn(`${BAT_FILE} not found. Enable autolaunch first.`);
    return;
  }

  if (isPortInUse(API_PORT) || isPortInUse(MCP_PORT)) {
    ui.info('Services are already running.');
    const restart = await ui.confirm('Kill existing instances and restart?', false);
    if (!restart) return;
  }

  const ok = await ui.confirm('Start services now?', true);
  if (!ok) return;

  const sp = ui.spinner('Launching services...');
  await execAsync(`cmd /c "${batPath}"`, installDir);
  sp.stop();

  await sleep(6000);

  let apiOk = false;
  let mcpOk = false;
  try { apiOk = (await fetch(`http://localhost:${API_PORT}/health`, { signal: AbortSignal.timeout(3000) })).ok; } catch { /* skip */ }
  try { mcpOk = (await fetch(`http://localhost:${MCP_PORT}/health`, { signal: AbortSignal.timeout(3000) })).ok; } catch { /* skip */ }

  ui.blank();
  if (apiOk && mcpOk) {
    ui.successBox('Test Passed', [
      '',
      `  ${ui.colorize('●', 'green')} corn-api :${API_PORT}  ${ui.colorize('UP', 'green')}`,
      `  ${ui.colorize('●', 'green')} corn-mcp :${MCP_PORT}  ${ui.colorize('UP', 'green')}`,
      '',
    ]);
  } else {
    ui.warn('Some services may not have started:');
    ui.substep(`corn-api :${API_PORT}  ${apiOk ? ui.colorize('UP', 'green') : ui.colorize('DOWN', 'red')}`);
    ui.substep(`corn-mcp :${MCP_PORT}  ${mcpOk ? ui.colorize('UP', 'green') : ui.colorize('DOWN', 'red')}`);
  }
}

export async function showAutolaunchMenu(installDir: string): Promise<void> {
  let loop = true;

  while (loop) {
    ui.clearScreen();
    ui.blank();
    ui.step(0, 0, '🚀 Autolaunch — Start with Windows');

    const status = getAutolaunchStatus();

    if (!status.supported) {
      ui.blank();
      ui.warn('Autolaunch is only supported on Windows.');
      await ui.waitForEnter();
      return;
    }

    ui.blank();
    const statusColor = status.enabled ? 'green' : 'dim';
    const statusIcon = status.enabled ? '✓ Enabled' : '✗ Disabled';

    ui.box('Autolaunch Status', [
      `Task:       ${ui.colorize(TASK_NAME, 'cyan')}`,
      `Status:     ${ui.colorize(statusIcon, statusColor)}`,
      `Trigger:    At logon (current user)`,
      `Services:   corn-api (:${API_PORT}) + corn-mcp (:${MCP_PORT})`,
      `Restart:    3 retries on failure`,
      `Install:    ${installDir}`,
    ]);

    const action = await ui.menu('Autolaunch', [
      { key: 'e', label: `${ui.colorize('>', 'cyan')} Enable`, hint: status.enabled ? ui.colorize('already enabled', 'dim') : 'Create scheduled task' },
      { key: 'd', label: `${ui.colorize('>', 'cyan')} Disable`, hint: !status.enabled ? ui.colorize('already disabled', 'dim') : 'Remove scheduled task' },
      { key: 't', label: `${ui.colorize('>', 'cyan')} Test`, hint: 'Run launcher now' },
      { key: 'b', label: `${ui.colorize('>', 'red')} Back`, hint: 'Return to main menu' },
    ]);

    switch (action) {
      case 'e':
        ui.blank();
        if (status.enabled) {
          const overwrite = await ui.confirm('Autolaunch is already enabled. Re-create it?', false);
          if (!overwrite) break;
        }
        await enableAutolaunch(installDir);
        await ui.waitForEnter();
        break;

      case 'd':
        ui.blank();
        if (!status.enabled) {
          ui.info('Autolaunch is already disabled.');
          await ui.waitForEnter();
          break;
        }
        const confirm = await ui.confirm('Disable autolaunch?', true);
        if (confirm) await disableAutolaunch(installDir);
        await ui.waitForEnter();
        break;

      case 't':
        ui.blank();
        await testAutolaunch(installDir);
        await ui.waitForEnter();
        break;

      case 'b':
      default:
        loop = false;
        break;
    }
  }
}
