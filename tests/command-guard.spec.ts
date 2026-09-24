import { afterAll, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
// @ts-expect-error plain-JS permanent host package
import { apply, installGuard } from '../packages/dsh-command-guard/lib/index.js'
// @ts-expect-error plain-JS permanent host package
import { assess, closeInspector, inspect, suspicious, verifyTarget } from '../packages/dsh-command-guard/lib/policy.js'

// Every original executor in this suite is a mock. Command strings are DATA.
const recurrence = "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*node*' } | Select-Object Id,CommandLine; taskkill /F /IM node.exe 2>&1 | Select-Object -First 3; Start-Sleep -Seconds 2; Get-Process node -ErrorAction SilentlyContinue | Select-Object Id | Format-Table -AutoSize | Out-String; Rename-Item assets/originals assets/originals.HIDDEN; Test-Path assets/originals; Test-Path assets/originals.HIDDEN; git status --porcelain=v1 | Select-Object -First 10; git check-ignore -v assets/originals.HIDDEN 2>&1 | Select-Object -First 3; echo HIDDEN"
const parse = (command: string) => inspect({ mode: 'parse', command })
const rows = [
  { pid: 10, parent: 20, name: 'node.exe', command: 'node dsh.mjs' },
  { pid: 20, parent: 30, name: 'pwsh.exe', command: 'pwsh start-dsh.ps1' },
  { pid: 30, parent: 0, name: 'terminal.exe', command: 'terminal.exe' },
  { pid: 40, parent: 30, name: 'node.exe', command: 'node preview.mjs' },
  { pid: 50, parent: 30, name: 'node.exe', command: 'node C:/runtime/@deepseek-ai/dsh/bin.mjs' },
]

afterAll(() => closeInspector())

describe('PowerShell AST policy (parse only, never execution)', () => {
  it.each([
    recurrence, 'taskkill /F /IM node.exe', 'TASKKILL.EXE /im * /f',
    '& "C:\\Windows\\System32\\taskkill.exe" /F /IM node.exe',
    'taskkill /FI "IMAGENAME eq node.exe" /F', 'taskkill /PID $pid /F',
    'taskkill /PID 40 /PID 50', 'taskkill /PID 40 /IM node.exe',
    'Stop-Process -Name node -Force', 'spps node', 'kill node',
    'Microsoft.PowerShell.Management\\Stop-Process -Name node',
    'Get-Process node | Stop-Process -Force', 'Stop-Process -Id (Get-Process node).Id',
    'Stop-Process -Id 40,50', 'Stop-Process -Id $target',
    'Stop-Process -Id 40; Write-Output done', 'Stop-Process -Id 40 > out.txt',
    'task`kill /F /IM node.exe', '& $command /F /IM node.exe',
    'cmd /c "taskkill /F /IM node.exe"', 'cmd /c taskkill /F /IM node.exe',
    'cmd /c "task^kill /F /IM node.exe"',
    'pwsh -NoProfile -Command "Stop-Process -Name node"',
    'powershell -EncodedCommand VABFAFMAVAA=', 'pwsh -enc VABFAFMAVAA=',
    'pwsh -Command "Stop-Process -Id 40"',
    'rtk taskkill /F /IM node.exe', 'rtk test taskkill /F /IM node.exe',
    'rtk proxy "taskkill /F /IM node.exe"',
    'rtk test cmd /c "taskkill /F /IM node.exe"',
    'rtk -- taskkill /F /IM node.exe', 'rtk test -- taskkill /F /IM node.exe',
    'Start-Process taskkill -ArgumentList "/F /IM node.exe"',
    'saps taskkill -ArgumentList "/F /IM node.exe"', 'iex "taskkill /F /IM node.exe"',
    'pkill node', 'killall node', 'Get-Process node | ForEach-Object { $_.Kill() }',
    'Stop-Process -Id 0', 'Stop-Process -Id 4294967296',
    'Stop-Process -Id 40 -Force -Force', 'Stop-Process -Id "unterminated',
  ])('blocks %s', (command) => {
    expect(() => assess(command)).toThrow('DSH command guard')
  })

  // PowerShell resolves these to a kill without the name appearing literally.
  it.each([
    "taskk''ill /F /IM node.exe", 'taskk""ill /F /IM node.exe', "task'kill' /F /IM node.exe",
    "npm test && taskk''ill /F /IM node.exe", "Stop-Pro''cess -Name node", "s''pps node",
    "taskk''ill /F /IM node.exe {",
    ". ('Stop-Pro'+'cess') -Name node", ".('taskk'+'ill') /F /IM node.exe", '. $command /F /IM node.exe',
    "iex ('taskk'+'ill /F /IM node.exe')", 'Invoke-Expression $env:CMD',
    'Get-Process node | % Kill', 'Get-Process node | % Kil*', "Get-Process node | ForEach-Object -MemberName 'K?ll'",
    'Get-Process node | foreach $member', "(Get-Process node).ForEach('Kill')", "(Get-Process node).ForEach('Ki'+'ll')",
    "(Get-Process node).('Ki'+'ll')()", '(Get-Process node).$member()',
    "icm ([scriptblock]::Create('taskk'+'ill /F /IM node.exe'))", "& ([scriptblock]::Create('Stop-Pro'+'cess -Name node'))",
    "$ExecutionContext.InvokeCommand.InvokeScript('taskk'+'ill /F /IM node.exe')",
    "[powershell]::Create().AddScript('taskk'+'ill /F /IM node.exe').Invoke()",
    "[powershell]::Create().AddCommand('Stop-Pro'+'cess').Invoke()", 'Start-Job -ScriptBlock $block',
    "Start-Process ('taskk'+'ill') '/F /IM node.exe'", "$t = 'taskk'+'ill'; Start-Process -FilePath $t '/F /IM node.exe'",
    'start taskkill -ArgumentList "/F /IM node.exe"',
    'Set-Alias k taskkill; k /F /IM node.exe', "sal k ('taskk'+'ill'); k /F /IM node.exe", "New-Alias k ('Stop-Pro'+'cess')",
  ])('blocks string-built or indirect form %s', (command) => {
    expect(() => assess(command)).toThrow('DSH command guard')
  })

  it.each([
    'git status --short', 'Get-Process node | Select-Object Id,Path',
    'Write-Output "taskkill /F /IM node.exe"',
    '# taskkill /F /IM node.exe\nGet-Process node',
    'rg "Stop-Process|taskkill" README.md', 'rtk read README.md',
    'rtk rg "taskkill" .', 'Write-Output \'kill\'',
    'pwsh -NoProfile -Command "Get-Process node"',
    'cmd /c "echo taskkill /F /IM node.exe"',
    'Get-ChildItem | ForEach-Object Name', 'Get-ChildItem | % { $_.Name }', '$items.ForEach({ $_ * 2 })',
    '{ Get-Date }.Invoke()', "Get-ChildItem | % FullName; Start-Process -FilePath 'node' -ArgumentList 'server.mjs'",
    "$x = 'a' + 'b'; $x.Length", '$files | % { $_', "Write-Output 'taskk''ill'",
  ])('passes safe read %s', (command) => {
    expect(assess(command)).toBeNull()
  })

  it.each([
    ['taskkill /PID 40 /F', false], ['taskkill /F /PID 40 /T', true],
    ['Stop-Process -Id 40 -Force', false], ['spps -Id 40', false], ['kill -Id 40', false],
  ])('recognizes standalone numeric target %s', (command, tree) => {
    expect(assess(command)).toEqual({ pid: 40, tree })
  })

  it('uses stdin data transport without expanding PowerShell expressions', () => {
    const ast = parse('Write-Output "taskkill $(1 + 2)"')
    expect(ast.commands[0].elements[1].literal).toBe(false)
    expect(ast.commands[0].elements[1].text).toContain('$(1 + 2)')
  })
  it.each([
    'git commit -m "fix: keep quotes cheap"', "rg 'Stop' src", 'npm run build', 'git log --format=%H -3',
    "node -e \"console.log('x' + 'y')\"", 'Get-Content README.md | Select-Object -First 5',
  ])('keeps common agent command %s off the parser', (command) => {
    expect(suspicious(command)).toBe(false)
  })
  it('keeps the persistent inspector usable after restart and preserves non-ASCII text', () => {
    const text = 'Write-Output "‘x’ 😀"'
    expect(parse(text).commands[0].elements[1].value).toBe('‘x’ 😀')
    closeInspector()
    expect(parse(text).commands[0].elements[1].value).toBe('‘x’ 😀')
  })
  it('does not start the parser for ordinary reads', () => {
    const parser = vi.fn()
    expect(assess('git diff --stat', parser)).toBeNull()
    expect(parser).not.toHaveBeenCalled()
  })
  it('fails closed on parser errors, missing data, and inspection failures', () => {
    for (const parser of [() => null, () => ({ errors: ['error'], commands: [] }), () => { throw new Error('inspection failed') }]) {
      expect(() => assess('taskkill /PID 40', parser)).toThrow()
    }
  })
})

describe('fresh process identity and ancestry checks', () => {
  it('allows an identified preview PID', () => expect(() => verifyTarget({ pid: 40 }, rows, 10)).not.toThrow())
  it.each([10, 20, 30, 50, 99])('rejects protected or missing PID %i', (pid) => {
    expect(() => verifyTarget({ pid }, rows, 10)).toThrow('DSH command guard')
  })
  it('rejects a tree containing host or a second runtime', () => {
    expect(() => verifyTarget({ pid: 40, tree: true }, rows.map((r) => r.pid === 10 ? { ...r, parent: 40 } : r), 10)).toThrow()
    expect(() => verifyTarget({ pid: 40, tree: true }, rows.map((r) => r.pid === 50 ? { ...r, parent: 40 } : r), 10)).toThrow()
  })
  it('allows a fully identifiable preview subtree', () => {
    expect(() => verifyTarget({ pid: 40, tree: true }, [...rows, { pid: 60, parent: 40, name: 'node.exe', command: 'node worker.js' }], 10)).not.toThrow()
  })
  it('rejects unknown ancestry, unknown target command line, cycles and malformed snapshots', () => {
    for (const snapshot of [null, [], rows.filter((r) => r.pid !== 20), [...rows, rows[0]], rows.map((r) => r.pid === 40 ? { ...r, command: null } : r), rows.map((r) => r.pid === 30 ? { ...r, parent: 10 } : r)]) {
      expect(() => verifyTarget({ pid: 40 }, snapshot, 10)).toThrow()
    }
  })
  it('never caches a previous PID approval', () => {
    verifyTarget({ pid: 40 }, rows, 10)
    expect(() => verifyTarget({ pid: 40 }, rows.filter((r) => r.pid !== 40), 10)).toThrow()
  })
  it('allows a proven host descendant when only an upper ancestor has exited', () => {
    const snapshot = rows.filter((r) => r.pid !== 30).map((r) => r.pid === 40 ? { ...r, parent: 10 } : r)
    expect(() => verifyTarget({ pid: 40 }, snapshot, 10)).not.toThrow()
    expect(() => verifyTarget({ pid: 20 }, snapshot, 10)).toThrow()
  })
  it('rejects external and orphan targets when upper host ancestry is missing', () => {
    const snapshot = rows.filter((r) => r.pid !== 30)
    expect(() => verifyTarget({ pid: 40 }, snapshot, 10)).toThrow('only proven host descendants')
    expect(() => verifyTarget({ pid: 40 }, snapshot.map((r) => r.pid === 40 ? { ...r, parent: 999 } : r), 10)).toThrow('External or orphan')
  })
  it('requires a gap-free descendant proof for tree roots and protects nested runtimes', () => {
    const snapshot = rows.filter((r) => r.pid !== 30).map((r) => r.pid === 40 ? { ...r, parent: 10 } : r)
    const child = { pid: 60, parent: 40, name: 'node.exe', command: 'node worker.js' }
    expect(() => verifyTarget({ pid: 40, tree: true }, [...snapshot, child], 10)).not.toThrow()
    expect(() => verifyTarget({ pid: 40, tree: true }, [...snapshot.map((r) => r.pid === 40 ? { ...r, parent: 999 } : r), child], 10)).toThrow()
    expect(() => verifyTarget({ pid: 40, tree: true }, [...snapshot.map((r) => r.pid === 50 ? { ...r, parent: 40 } : r), child], 10)).toThrow()
  })
  it('rejects missing host or any snapshot cycle even for an otherwise safe descendant', () => {
    expect(() => verifyTarget({ pid: 40 }, rows.filter((r) => r.pid !== 10), 10)).toThrow('host process')
    expect(() => verifyTarget({ pid: 40 }, [...rows, { pid: 80, parent: 90 }, { pid: 90, parent: 80 }], 10)).toThrow('cyclic')
  })
})

describe('shared shell boundary and lifecycle', () => {
  function shellFixture() {
    const result = Promise.resolve({ stdout: 'ok' })
    const handle = { done: Promise.resolve(), kill: vi.fn(), readOutput: vi.fn() }
    const run = vi.fn(function (this: unknown, _spec: unknown) { return result })
    const start = vi.fn(function (this: unknown, _spec: unknown) { return handle })
    const shell = { run, start }
    return { shell, run, start, result, handle }
  }
  it('blocks exact recurrence on foreground/background with zero original calls', () => {
    const f = shellFixture()
    const guard = installGuard(f.shell)
    for (const method of ['run', 'start'] as const) {
      expect(() => f.shell[method]({ command: recurrence } as never)).toThrow('Do not bypass')
      expect(() => f.shell[method]({ command: "taskk''ill /F /IM node.exe" } as never)).toThrow('Do not bypass')
    }
    expect(f.run).not.toHaveBeenCalled()
    expect(f.start).not.toHaveBeenCalled()
    guard.dispose()
  })
  it('preserves this, argument identities, promise/handle identity and cleanup', () => {
    const f = shellFixture()
    const guard = installGuard(f.shell)
    const arg = { command: 'git status', sandboxPolicy: { mode: 'danger-full-access' } }
    expect(f.shell.run(arg as never)).toBe(f.result)
    expect(f.shell.start(arg as never)).toBe(f.handle)
    expect(f.run.mock.contexts[0]).toBe(f.shell)
    expect(f.run.mock.calls[0]?.[0]).toBe(arg)
    f.handle.kill()
    expect(f.handle.kill).toHaveBeenCalledOnce()
    guard.dispose()
  })
  it('duplicates share wrappers and restore exact descriptors only after last disposal', () => {
    const f = shellFixture()
    const before = Object.getOwnPropertyDescriptors(f.shell)
    const check = vi.fn()
    const a = installGuard(f.shell, check)
    const wrapped = f.shell.run
    const b = installGuard(f.shell, check)
    expect(f.shell.run).toBe(wrapped)
    a.dispose(); a.dispose()
    f.shell.run({ command: 'git status' } as never)
    expect(check).toHaveBeenCalledOnce()
    b.dispose()
    expect(Object.getOwnPropertyDescriptors(f.shell)).toEqual(before)
  })
  it('never falls through after inspection fails, including wider sandbox requests', () => {
    const f = shellFixture()
    const guard = installGuard(f.shell, () => { throw new Error('inspection failed') })
    expect(() => f.shell.run({ command: 'taskkill /PID 40', sandboxPolicy: { mode: 'danger-full-access' } } as never)).toThrow()
    expect(f.run).not.toHaveBeenCalled()
    guard.dispose()
  })
  it('fails loudly and rolls back partial attachment', () => {
    const f = shellFixture()
    Object.defineProperty(f.shell, 'start', { configurable: false })
    expect(() => installGuard(f.shell)).toThrow('not replaceable')
    expect(f.shell.run).toBe(f.run)
  })
  it('leaves exact descriptors intact when the first method cannot attach', () => {
    const f = shellFixture()
    Object.defineProperty(f.shell, 'run', { configurable: false })
    const before = Object.getOwnPropertyDescriptors(f.shell)
    expect(() => installGuard(f.shell)).toThrow('not replaceable')
    expect(Object.getOwnPropertyDescriptors(f.shell)).toEqual(before)
  })
  it('rolls back when the second method is missing', () => {
    const shell = { run: vi.fn() }
    const before = Object.getOwnPropertyDescriptors(shell)
    expect(() => installGuard(shell)).toThrow('cannot attach shell.start')
    expect(Object.getOwnPropertyDescriptors(shell)).toEqual(before)
  })
  it('preserves a subsequent third-party wrapper on disposal and reports detached', () => {
    const f = shellFixture()
    const guard = installGuard(f.shell)
    const replacement = vi.fn()
    f.shell.run = replacement as any
    expect(guard.attached()).toBe(false)
    expect(() => installGuard(f.shell)).toThrow('was replaced')
    guard.dispose()
    expect(f.shell.run).toBe(replacement)
  })
  it('guards real Cordis service proxies, nested callers, and plugin disposal', async () => {
    const calls: unknown[] = []
    class FakeShell extends Service {
      constructor(ctx: Context) { super(ctx, 'shell') }
      run(spec: unknown) { calls.push(spec); return Promise.resolve('ok') }
      start(spec: unknown) { calls.push(spec); return { done: Promise.resolve() } }
    }
    const ctx = new Context()
    const provider = await ctx.plugin(FakeShell)
    const original = Object.getOwnPropertyDescriptors(FakeShell.prototype)
    const plugin = await ctx.plugin({ name: 'test-guard', inject: ['shell'], apply })
    try {
      const caller = ctx.extend()
      const nested = caller.extend()
      const rootShell = ctx.get('shell') as any
      const nestedShell = nested.get('shell') as any
      expect(rootShell).not.toBe(nestedShell)
      expect(() => rootShell.run({ command: recurrence })).toThrow('DSH command guard')
      expect(() => nestedShell.start({ command: 'rtk test taskkill /F /IM node.exe' })).toThrow('DSH command guard')
      expect(calls).toEqual([])
      expect(await nestedShell.run({ command: 'git status' })).toBe('ok')
      expect(calls).toHaveLength(1)
    } finally {
      await plugin.dispose()
      expect(Object.getOwnPropertyDescriptors(FakeShell.prototype)).toEqual(original)
      await provider.dispose()
    }
  })
})

describe('opt-in read-only status', () => {
  function fixture(config: object) {
    const cleanup: Array<() => void> = []
    let route: any
    const ctx: any = {
      shell: { run: vi.fn(), start: vi.fn() },
      effect: (callback: () => () => void) => cleanup.push(callback()),
      inject: (_: string[], callback: (value: any) => void) => callback(ctx),
      webServer: { register: (value: unknown) => { route = value; return () => {} } },
    }
    apply(ctx, config)
    return { route, cleanup: () => cleanup.reverse().forEach((f) => f()) }
  }
  it('has no endpoint by default', () => { const f = fixture({}); expect(f.route).toBeUndefined(); f.cleanup() })
  it.each([
    ['GET', '127.0.0.1', 'localhost:3000', undefined, 200],
    ['POST', '127.0.0.1', 'localhost:3000', undefined, 405],
    ['GET', '192.168.0.2', 'localhost:3000', undefined, 403],
    ['GET', '127.0.0.1', 'evil.example', undefined, 403],
    ['GET', '127.0.0.1', 'localhost:3000', 'https://evil.example', 403],
  ])('returns %s %s %s %s -> %i', (method, remoteAddress, host, origin, expected) => {
    const f = fixture({ statusEndpoint: true })
    const response = { writeHead: vi.fn(), end: vi.fn() }
    f.route.handler({ method, socket: { remoteAddress }, headers: { host, origin } }, response)
    expect(response.writeHead.mock.calls[0]?.[0]).toBe(expected)
    if (expected === 200) expect(JSON.parse(response.end.mock.calls[0]?.[0])).toEqual({ name: 'dsh-command-guard', version: 1, attached: true, methods: ['run', 'start'] })
    f.cleanup()
  })
})
