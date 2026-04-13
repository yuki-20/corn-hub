import { Hono } from 'hono'
import os from 'node:os'

export const systemRouter = new Hono()

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function getCpuUsage(): { percent: number; cores: number; model: string; loadAvg: number[] } {
  const cpus = os.cpus()
  const loadAvg = os.loadavg()
  const cores = cpus.length
  const percent = Math.min(100, Math.round((loadAvg[0]! / cores) * 100))
  return {
    percent,
    cores,
    model: cpus[0]?.model ?? 'Unknown',
    loadAvg: loadAvg.map(l => Math.round(l * 100) / 100),
  }
}

async function getContainerStats(): Promise<Array<{ name: string; status: string; cpu: string; memory: string }>> {
  try {
    const { promisify } = await import('node:util')
    const { exec } = await import('node:child_process')
    const execAsync = promisify(exec)

    const { stdout } = await execAsync(
      'docker ps -a --filter name=corn- --format "{{.Names}}|{{.State}}|{{.Status}}|{{.Image}}"',
      { timeout: 5000, encoding: 'utf-8' },
    )
    const psOutput = stdout.trim()

    if (!psOutput) return []

    return psOutput.split('\n').filter(Boolean).map((line: string) => {
      const [name, state, status, image] = line.split('|')
      return { name: name ?? 'unknown', status: state ?? 'unknown', cpu: 'N/A', memory: status ?? '' }
    })
  } catch {
    return []
  }
}

systemRouter.get('/metrics', async (c) => {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const memPercent = Math.round((usedMem / totalMem) * 100)

  const cpu = getCpuUsage()
  const containers = await getContainerStats()

  const networkInterfaces = os.networkInterfaces()
  const primaryIp = Object.values(networkInterfaces)
    .flat()
    .find(iface => iface && !iface.internal && iface.family === 'IPv4')?.address ?? 'unknown'

  return c.json({
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: Math.floor(os.uptime()),
    ip: primaryIp,
    cpu: {
      percent: cpu.percent,
      cores: cpu.cores,
      model: cpu.model,
      loadAvg: cpu.loadAvg,
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percent: memPercent,
      totalHuman: formatBytes(totalMem),
      usedHuman: formatBytes(usedMem),
      freeHuman: formatBytes(freeMem),
    },
    containers,
  })
})
