import { existsSync } from 'node:fs'
import { join, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads'

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

// One long-lived PowerShell answers every inspection. A cold start costs about
// 0.5-2.5 s on Windows, and the shell hook must block for it, so a process per
// command would stall every DSH session. The caller still blocks synchronously:
// Atomics.wait until the worker thread signals, then read the reply in place.
let inspector
let sequence = 0

function startInspector() {
  const signal = new Int32Array(new SharedArrayBuffer(4))
  const { port1, port2 } = new MessageChannel()
  const worker = new Worker(new URL('./inspector-worker.js', import.meta.url), {
    workerData: { exe: powershellPath(), helper, port: port2, signal }, transferList: [port2],
  })
  worker.unref()
  worker.on('error', () => { if (inspector?.worker === worker) inspector = undefined })
  return { worker, port: port1, signal }
}

/** Start PowerShell ahead of the first suspicious command. Failures surface on use. */
export function warmInspector() {
  try { inspector ??= startInspector() } catch {}
}

export function closeInspector() {
  const current = inspector
  inspector = undefined
  if (!current) return
  current.worker.postMessage({ close: true })
  current.port.close()
  setTimeout(() => void current.worker.terminate(), 5_000).unref()
}

export function inspect(input) {
  // ASCII-only JSON, so console code pages cannot alter the command text.
  const line = JSON.stringify(input).replace(/[\u007f-\uFFFF]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  inspector ??= startInspector()
  const { worker, port, signal } = inspector
  const id = ++sequence
  Atomics.store(signal, 0, 0)
  worker.postMessage({ id, line })
  const deadline = Date.now() + 15_000
  for (;;) {
    for (let received; (received = receiveMessageOnPort(port));) {
      const reply = received.message
      if (reply.id !== id) continue
      if (reply.fault) { closeInspector(); throw blocked('read-only inspection failed') }
      let result
      try { result = JSON.parse(reply.line) } catch {}
      if (!result || typeof result !== 'object' || result.fault) throw blocked('invalid inspection result')
      return result
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) { closeInspector(); throw blocked('read-only inspection failed') }
    Atomics.wait(signal, 0, 0, remaining)
    Atomics.store(signal, 0, 0)
  }
}

const leaf = (name) => win32.basename(name || '').toLowerCase().replace(/\.exe$/, '')
const kills = new Set(['taskkill', 'stop-process', 'spps', 'kill', 'pkill', 'killall'])
const shells = new Set(['pwsh', 'powershell', 'cmd'])
const keywords = /(?:taskkill|stop-process|\bspps\b|\b(?:p?kill|killall)\b|powershell|pwsh|\bcmd\b|\brtk\b|[`&])/i
// PowerShell drops quotes inside a bareword: taskk''ill and task"kill" run taskkill.
const quotes = /['"\u2018-\u201f]/g
// Constructs that can reach a command or member whose name never appears
// literally: the dot call operator, dynamic members (.$m(), .('Ki'+'ll')()),
// evaluators, member-name ForEach, aliases, and dynamic Start-Process targets.
const dynamic = new RegExp([
  String.raw`(?:^|[\s;|({=,])\.(?=\s*[($'"\u2018-\u201f{])`,
  String.raw`[\w)\]}'"]\s*\.\s*[$(]`,
  String.raw`\b(?:iex|icm|sajb|sal|nal)\b|invoke-(?:expression|command)|start-(?:thread)?job|(?:set|new)-alias`,
  String.raw`scriptblock|invokecommand|add(?:script|command)|\.(?:\w*invoke\w*|foreach)\s*\(`,
  String.raw`foreach-object|\|\s*(?:%|foreach)(?=[\s(]|$)`,
  String.raw`(?:start-process|\bsaps|(?:^|[\s;|&({])start)\s+(?:-f\w*[:\s]\s*)?[$(@]`,
].join('|'), 'i')

const named = (command) => keywords.test(command) || keywords.test(command.replace(quotes, ''))

/** Cheap gate for the parser. Commands it rejects have no known route to a kill. */
export function suspicious(command) {
  return named(command) || dynamic.test(command)
}

const invokers = new Set(['foreach-object', '%', 'foreach'])
const evaluators = new Set(['invoke-command', 'icm', 'start-job', 'sajb', 'start-threadjob'])
const aliases = new Set(['set-alias', 'sal', 'new-alias', 'nal'])
// Arguments PowerShell may run or resolve by name: anything but switches, script
// block literals (their commands are in the AST already), and plain literals.
const opaque = (e) => !e.literal && e.kind !== 'ScriptBlockExpressionAst'
const launchers = new Set(['start-process', 'saps', 'start'])
const guarded = new Set([...kills, ...shells, ...invokers, ...evaluators, ...aliases, ...launchers, 'invoke-expression', 'iex', 'rtk'])

/** Parse every shell request; quoted examples and comments stay data in the AST. */
export function assess(command, parse = (text) => inspect({ mode: 'parse', command: text }), depth = 0) {
  if (typeof command !== 'string' || command.length > 256 * 1024 || depth > 6) throw blocked('uninspectable command')
  if (!suspicious(command)) return null
  const ast = parse(command)
  if (!Array.isArray(ast?.errors) || !Array.isArray(ast.commands)) throw blocked('unparseable command')
  if (ast.errors.length) {
    // PowerShell runs nothing from a script that fails to parse. Top-level commands
    // routed only by a dynamic construct pass so pwsh reports the syntax error;
    // named programs and wrapped bodies (cmd may still run them) fail closed.
    if (depth > 0 || named(command)) throw blocked('unparseable command')
    return null
  }
  if (ast.killMembers) throw blocked('unverified process Kill invocation')
  if (ast.dynamicMembers) throw blocked('dynamic member invocation')
  if (ast.evaluators) throw blocked('dynamic script evaluation')
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
    } else if (launchers.has(name) && !named(command)) {
      // Routed only by a dynamic construct elsewhere: a literal program still
      // launches, but a computed one could be a string-built taskkill.
      const file = /^-f/i.test(elements[1]?.value ?? '') ? elements[2] : elements[1]
      if (!file?.literal || file.value.startsWith('-') || guarded.has(leaf(file.value))) throw blocked('Start-Process target must be a literal program path')
    } else if (launchers.has(name) || ['invoke-expression', 'iex'].includes(name)) {
      // These launch/evaluate arguments rather than printing them. A suspicious
      // request cannot earn a PID allowance through this alternate entry point.
      throw blocked('uninspectable process or expression wrapper')
    } else if (invokers.has(name)) {
      // ForEach-Object Kil* calls Process.Kill through a wildcard member name.
      if (elements.slice(1).some((e) => e.killName || opaque(e))) throw blocked('member invocation by name')
    } else if (evaluators.has(name)) {
      if (elements.slice(1).some(opaque)) throw blocked('dynamic script evaluation')
    } else if (aliases.has(name)) {
      if (elements.slice(1).some((e) => !e.literal || guarded.has(leaf(e.value)))) throw blocked('alias to a guarded command')
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
