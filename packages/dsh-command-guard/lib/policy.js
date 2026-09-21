import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const helper = fileURLToPath(new URL('./inspect.ps1', import.meta.url))
const MESSAGE = 'DSH command guard: process termination was blocked. Find the intended preview PID and use a standalone literal numeric PID command. Do not bypass this guard or retry with a wider sandbox.'
export function blocked(reason) { return new Error(`${MESSAGE} (${reason})`) }

/** Use an installed absolute executable, never command text or a caller PATH. */
export function powershellPath() {
  const candidates = process.platform === 'win32'
    ? [join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'), join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')]
    : ['/usr/bin/pwsh', '/usr/local/bin/pwsh']
  const found = candidates.find(existsSync)
  if (!found) throw blocked('trusted PowerShell parser unavailable')
  return found
}

export function inspect(input) {
  const result = spawnSync(powershellPath(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', helper], {
    input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 8 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) throw blocked('read-only inspection failed')
  try { return JSON.parse(result.stdout.replace(/^\uFEFF/, '')) } catch { throw blocked('invalid inspection result') }
}

const leaf = (name) => win32.basename(name || '').toLowerCase().replace(/\.exe$/, '')
const kills = new Set(['taskkill', 'stop-process', 'spps', 'kill', 'pkill', 'killall'])
const shells = new Set(['pwsh', 'powershell', 'cmd'])

/** Parse every shell request; quoted examples and comments stay data in the AST. */
export function assess(command, parse = (text) => inspect({ mode: 'parse', command: text }), depth = 0) {
  if (typeof command !== 'string' || command.length > 256 * 1024 || depth > 6) throw blocked('uninspectable command')
  if (!/(?:taskkill|stop-process|\bspps\b|\b(?:p?kill|killall)\b|powershell|pwsh|\bcmd\b|\brtk\b|[`&])/i.test(command)) return null
  const ast = parse(command)
  if (!Array.isArray(ast?.errors) || ast.errors.length || !Array.isArray(ast.commands)) throw blocked('unparseable command')
  if (ast.killMembers) throw blocked('unverified process Kill invocation')
  let target = null
  for (const entry of ast.commands) {
    const elements = entry.elements
    if (!Array.isArray(elements) || !elements.length) throw blocked('invalid command AST')
    const name = leaf(entry.name)
    if (!name) throw blocked('dynamic command invocation')
    if (kills.has(name)) {
      if (!ast.standalone || entry.redirects || target) throw blocked('termination must be standalone')
      target = literalTarget(name, elements.slice(1))
    } else if (shells.has(name)) {
      // Nested shells may have different expansion semantics. Analyze literal bodies
      // for coverage, but never grant numeric termination through a wrapper.
      const args = elements.slice(1)
      if (args.some((e) => !e.literal)) throw blocked('dynamic shell wrapper')
      const values = args.map((e) => e.value)
      const index = values.findIndex((v) => /^(?:-[cC](?:ommand)?|\/[cCkK])$/.test(v))
      if (index < 0 || values.slice(0, index).some((v) => !/^-(?:noprofile|nologo|noninteractive)$/i.test(v))) throw blocked('uninspectable shell wrapper')
      const body = args.slice(index + 1)
      if (!body.length) throw blocked('missing shell body')
      const source = body.length === 1 ? body[0].value : command.slice(body[0].start, body.at(-1).end)
      if (name === 'cmd' && /[\^%!]/.test(source)) throw blocked('cmd expansion cannot be verified')
      if (assess(source, parse, depth + 1)) throw blocked('wrapped termination')
    } else if (['start-process', 'saps', 'invoke-expression', 'iex'].includes(name)) {
      // These launch/evaluate arguments rather than printing them. A suspicious
      // request cannot earn a PID allowance through this alternate entry point.
      throw blocked('uninspectable process or expression wrapper')
    } else if (name === 'rtk') {
      const args = elements.slice(1)
      if (args.some((e) => !e.literal)) throw blocked('dynamic RTK wrapper')
      // Read arguments remain data. Commands that dispatch other programs must
      // be inspected, including unknown RTK verbs (future versions may forward).
      const verb = leaf(args[0]?.value)
      if (!['read', 'rg', 'grep', 'find', 'ls', 'git', 'log', 'diff', 'status', 'gain', 'help', '--help', '--version'].includes(verb)) {
        const body = ['test', 'proxy'].includes(verb) ? args.slice(1) : args
        if (!body.length) throw blocked('missing RTK command')
        const source = body.length === 1 ? body[0].value : body.map((e) => e.text).join(' ')
        if (assess(source, parse, depth + 1)) throw blocked('wrapped termination')
        if (body.some((e) => kills.has(leaf(e.value)))) throw blocked('RTK termination arguments')
      }
    }
  }
  return target
}

function literalTarget(name, args) {
  if (name === 'pkill' || name === 'killall') throw blocked('broad termination command')
  if (args.some((e) => !e.literal)) throw blocked('dynamic termination target')
  const values = args.map((e) => e.value.toLowerCase())
  let pid, tree = false
  const seen = new Set()
  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (seen.has(value)) throw blocked('duplicate termination argument')
    seen.add(value)
    if ((name === 'taskkill' && value === '/pid') || (name !== 'taskkill' && value === '-id')) {
      if (pid !== undefined || !/^[1-9]\d*$/.test(values[i + 1] || '')) throw blocked('expected one numeric PID')
      pid = Number(values[++i])
    } else if ((name === 'taskkill' && value === '/f') || (name !== 'taskkill' && value === '-force')) {
      // Only these exact switches are allowed.
    } else if (name === 'taskkill' && value === '/t') tree = true
    else throw blocked('broad or unsupported termination syntax')
  }
  if (!Number.isSafeInteger(pid) || pid > 0xffffffff) throw blocked('expected one numeric PID')
  return { pid, tree }
}

/** Fresh snapshot per kill; never cache PID approvals. PID reuse remains an OS race. */
export function verifyTarget(target, processes, hostPid = process.pid) {
  if (!Array.isArray(processes) || !processes.length) throw blocked('process inspection unavailable')
  const rows = new Map()
  for (const row of processes) {
    if (!Number.isInteger(row.pid) || !Number.isInteger(row.parent) || row.pid < 0 || row.parent < 0 || rows.has(row.pid)) throw blocked('invalid process snapshot')
    rows.set(row.pid, row)
  }
  // A snapshot may omit an exited parent, but contradictory parent cycles are
  // not evidence from which any termination approval can safely be derived.
  for (const pid of rows.keys()) {
    const seen = new Set()
    let cursor = pid
    while (cursor !== 0 && rows.has(cursor)) {
      if (seen.has(cursor)) throw blocked('cyclic process snapshot')
      seen.add(cursor)
      cursor = rows.get(cursor).parent
    }
  }
  if (!rows.has(hostPid)) throw blocked('host process cannot be verified')
  const protectedPids = new Set()
  let current = hostPid
  let incompleteAncestry = false
  while (current !== 0) {
    protectedPids.add(current)
    if (!rows.has(current)) { incompleteAncestry = true; break }
    current = rows.get(current).parent
  }
  for (const row of rows.values()) {
    if (/(?:deepseek[-\\/ ]?harness|@deepseek-ai[\\/]dsh|(?:^|[\\/\s"'])dsh(?:\.m?js|\.cjs|\.exe|\s|[\\/"']|$)|start-dsh|start-branchline)/i.test(`${row.name || ''} ${row.command || ''}`)) protectedPids.add(row.pid)
  }
  const targets = new Set([target.pid])
  if (target.tree) {
    let grew = true
    while (grew) {
      grew = false
      for (const row of rows.values()) if (targets.has(row.parent) && !targets.has(row.pid)) { targets.add(row.pid); grew = true }
    }
  }
  for (const pid of targets) {
    const row = rows.get(pid)
    if (!row || typeof row.command !== 'string' || !row.command.trim() || protectedPids.has(pid)) throw blocked('target is protected, missing, or unidentifiable')
    if (incompleteAncestry) {
      let cursor = row.parent
      while (cursor !== 0 && cursor !== hostPid && rows.has(cursor)) cursor = rows.get(cursor).parent
      if (cursor !== hostPid) throw blocked('an upper host ancestor has exited; only proven host descendants are allowed. External or orphan targets are refused; use job_kill for a DSH-owned background job')
    }
  }
}

export function checkCommand(command) {
  const target = assess(command)
  if (target) verifyTarget(target, inspect({ mode: 'processes' }))
}
