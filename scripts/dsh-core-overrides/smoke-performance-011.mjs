// Smoke test for the 0.1.1-rc.2 set in apply-performance.ps1. Loads the patched
// bundles from a scratch copy (never the live npx cache) through a stub module
// loader and exercises the patched code paths. With the pristine dir as the
// second argument it also checks the patched code against the original on the
// same inputs.
//
// Usage: node smoke-performance-011.mjs <patched @deepseek-ai dir> [<pristine @deepseek-ai dir>]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const [scope, pristine] = process.argv.slice(2)
if (!scope) throw new Error('usage: node smoke-performance-011.mjs <patched dir> [<pristine dir>]')
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const count = (text, needle) => text.split(needle).length - 1

const stub = new Proxy(function () {}, {
  get: (_t, key) => (key === Symbol.toPrimitive || key === 'then' ? undefined : stub),
  apply: () => stub,
  construct: () => ({}),
})

// Evaluate one browser bundle with stub dependencies, exposing named internals to this test only.
function load(dir, pkg, expose = [], deps = {}) {
  let source = readFileSync(join(dir, pkg, 'lib', 'client.js'), 'utf8')
  const tail = '\t\treturn module.exports;\n\t}\n});'
  assert.equal(count(source, tail), 1, `${pkg}: one module tail`)
  source = source.replace(tail, expose.map((name) => `\t\texports.__${name} = ${name};\n`).join('') + tail)
  let factory
  const window = { __ModuleLoader__: { load: (entry) => { factory = entry.factory } } }
  new Function('window', source)(window)
  assert.equal(typeof factory, 'function', `${pkg}: bundle registered a factory`)
  return factory((id) => deps[id] ?? (id === 'react' || id === 'react-dom' ? reactStub : stub))
}

// __toESM copies own property names, so React needs a plain object of stubs.
const reactStub = Object.fromEntries([
  'Children', 'Component', 'Fragment', 'PureComponent', 'StrictMode', 'Suspense', 'cloneElement', 'createContext',
  'createElement', 'createPortal', 'createRef', 'flushSync', 'forwardRef', 'isValidElement', 'lazy', 'memo',
  'startTransition', 'useCallback', 'useContext', 'useDeferredValue', 'useEffect', 'useId', 'useImperativeHandle',
  'useInsertionEffect', 'useLayoutEffect', 'useMemo', 'useReducer', 'useRef', 'useState', 'useSyncExternalStore',
  'useTransition',
].map((name) => [name, stub]))

function assertMarker(pkg, file, marker) {
  assert.ok(readFileSync(join(scope, pkg, file), 'utf8').includes(`dsh-core-override: ${marker}`), `${pkg}: ${marker} marker present`)
}

// Braces balance outside comments and strings.
function cssBalanced(css) {
  let depth = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      if (end < 0) return false
      i = end + 1
    } else if (c === '"' || c === "'") {
      let j = i + 1
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1
      if (j >= css.length) return false
      i = j
    } else if (c === '{') depth++
    else if (c === '}' && --depth < 0) return false
  }
  return depth === 0
}

// --- client-runtime ---------------------------------------------------------

for (const marker of ['perf-list-cache-linear', 'perf-session-park']) assertMarker('dsh-client-runtime', 'lib/client.js', marker)
const rt = load(scope, 'dsh-client-runtime', ['Session', 'SessionRuntime', 'SessionManager'])
const { __Session: Session, __SessionRuntime: SessionRuntime, __SessionManager: SessionManager } = rt
assert.equal(typeof Session.prototype.park, 'function', 'Session.park exists')
assert.equal(typeof SessionRuntime.prototype.schedulePark, 'function', 'SessionRuntime.schedulePark exists')
assert.match(SessionManager.prototype.buildListSnapshot.toString(), /itemIds\.has\(id\)/, 'list cache prune uses the id Set')

// A real Session over a fake history API.
function makeSession() {
  const calls = { history: 0 }
  let log = [1, 2, 3].map((seq) => ({ event: { seq, type: 'x/note', time: seq, data: {} }, view: undefined }))
  const api = {
    sessions: {
      history: async () => {
        calls.history++
        return { result: { ok: true, value: { events: log, hasMore: false } } }
      },
    },
    respond: () => {},
  }
  const session = new Session('s1', api, {}, {})
  return { session, calls, append: (seq) => { log = [...log, { event: { seq, type: 'x/note', time: seq, data: {} }, view: undefined }] } }
}

{
  const { session, calls, append } = makeSession()
  await session.open()
  assert.equal(session.openState, 'open')
  assert.equal(session.events.length, 3)
  session.handleMuxEnvelope('rpc-a', { type: 'approval/requested', sessionId: 's1', approvalId: 'a1' })
  assert.equal(session.getSnapshot().pending.length, 1, 'approval pending')
  assert.equal(session.park(), true, 'open session parks')
  assert.equal(session.openState, 'cold')
  assert.equal(session.events.length, 0, 'window released')
  assert.equal(session.getSnapshot().pending.length, 1, 'pending approval kept while parked')
  assert.equal(session.park(), false, 'cold session does not park twice')
  // Live events for a parked session are dropped, not assembled.
  append(4)
  session.handleMuxEnvelope('rpc-e', { type: 'session/event', sessionId: 's1', event: { seq: 4, type: 'x/note', time: 4, data: {} } })
  assert.equal(session.events.length, 0, 'parked session drops live events')
  // Queue frames still land while parked.
  session.handleMuxEnvelope('rpc-q', { type: 'session/queue', sessionId: 's1', items: [{ id: 'q1', placement: 'queued', message: { id: 'm1', content: [{ type: 'text', text: 'hi' }] } }] })
  assert.equal(session.getSnapshot().queue.length, 1, 'queue frame lands while parked')
  // Reconnect: a parked window clears pending like an open one and does not refetch.
  await session.resync()
  assert.equal(session.getSnapshot().pending.length, 0, 'resync clears parked pending waits')
  assert.equal(calls.history, 1, 'parked resync does not reopen')
  // Reopen rebuilds from history, including the event dropped while parked.
  await session.open()
  assert.equal(session.openState, 'open', 'reopen after park')
  assert.equal(calls.history, 2)
  assert.deepEqual(session.events.map((e) => e.seq), [1, 2, 3, 4], 'reopen backfills from history')
  // Guards.
  for (const [label, setup] of [
    ['loading older', (s) => { s.loadingOlder = true }],
    ['gap repair', (s) => { s.stitching = true }],
    ['steering row', (s) => { s.queueMirror.current = [{ id: 'q', placement: 'steering' }] }],
    ['loading', (s) => { s.openState = 'loading' }],
  ]) {
    const { session: s } = makeSession()
    await s.open()
    setup(s)
    assert.equal(s.park(), false, `${label} blocks park`)
  }
  // A never-opened cold session keeps upstream resync behavior (no pending clear).
  const { session: fresh } = makeSession()
  fresh.handleMuxEnvelope('rpc-b', { type: 'approval/requested', sessionId: 's1', approvalId: 'b1' })
  await fresh.resync()
  assert.equal(fresh.getSnapshot().pending.length, 1, 'unparked cold session untouched by resync')
}

// followCurrent + park scheduling with a short grace period.
{
  const sessions = new Map()
  const opened = []
  const rs = Object.create(SessionRuntime.prototype)
  let snapshot = { current: 'a', byId: { a: {}, b: {}, c: {} }, ids: ['a', 'b', 'c'] }
  Object.assign(rs, {
    parkTimers: new Map(), parkGraceMs: 20, deferredRemovals: new Set(), watched: undefined,
    scopes: new Map(),
    list: { getSnapshot: () => snapshot },
    manager: { refreshSubagents() {} },
  })
  rs.eligible = () => true
  rs.resolve = (id) => {
    if (!rs.scopes.has(id)) {
      const s = {
        openState: 'cold', parked: undefined, busy: false,
        open() { opened.push(id); this.openState = 'open' },
        park() { if (this.openState !== 'open' || this.busy) return false; this.openState = 'cold'; this.parked = true; return true },
      }
      sessions.set(id, s)
      rs.scopes.set(id, { session: s })
    }
    return rs.scopes.get(id)
  }
  rs.followCurrent()
  assert.equal(rs.parkTimers.size, 0, 'first stage schedules nothing')
  snapshot = { ...snapshot, current: 'b' }
  rs.followCurrent()
  assert.deepEqual([...rs.parkTimers.keys()], ['a'], 'previous occupant scheduled')
  snapshot = { ...snapshot, current: 'a' }
  rs.followCurrent()
  assert.deepEqual([...rs.parkTimers.keys()], ['b'], 'returning to a cancels its timer')
  await tick(50)
  assert.equal(sessions.get('b').openState, 'cold', 'b parked after grace')
  assert.equal(sessions.get('a').openState, 'open', 'staged a stays open')
  // A busy session retries until it can park.
  sessions.get('a').busy = true
  snapshot = { ...snapshot, current: 'c' }
  rs.followCurrent()
  await tick(50)
  assert.equal(sessions.get('a').openState, 'open', 'busy a not parked')
  assert.ok(rs.parkTimers.has('a'), 'busy a rescheduled')
  sessions.get('a').busy = false
  await tick(50)
  assert.equal(sessions.get('a').openState, 'cold', 'a parked once settled')
  // Re-staging a parked session reopens it through open().
  snapshot = { ...snapshot, current: 'a' }
  rs.followCurrent()
  assert.equal(sessions.get('a').openState, 'open', 'reopen on return')
  // An empty selection keeps the stage but parks its occupant; reselecting reopens.
  snapshot = { ...snapshot, current: undefined }
  rs.followCurrent()
  assert.equal(rs.watched, 'a', 'empty selection keeps the stage')
  assert.ok(rs.parkTimers.has('a'), 'cleared occupant scheduled')
  await tick(50)
  assert.equal(sessions.get('a').openState, 'cold', 'a parked after selection cleared')
  rs.followCurrent()
  assert.equal(rs.parkTimers.size, 0, 'a parked occupant is not rescheduled')
  const before = opened.length
  snapshot = { ...snapshot, current: 'a' }
  rs.followCurrent()
  assert.equal(sessions.get('a').openState, 'open', 'reselect after clear reopens')
  assert.equal(opened.length, before + 1)
  rs.followCurrent()
  assert.equal(opened.length, before + 1, 'no reopen while already open')
  // A transient empty selection that returns within the grace period cancels the park.
  snapshot = { ...snapshot, current: undefined }
  rs.followCurrent()
  snapshot = { ...snapshot, current: 'a' }
  rs.followCurrent()
  assert.equal(rs.parkTimers.size, 0, 'transient empty selection cancels the park')
  // An unlisted current keeps the stage open (upstream masked gap).
  snapshot = { ...snapshot, current: 'zz' }
  rs.followCurrent()
  assert.equal(rs.watched, 'a')
  assert.equal(rs.parkTimers.size, 0)
  for (const t of rs.parkTimers.values()) clearTimeout(t)
}

// --- ui-conversation --------------------------------------------------------

for (const marker of ['perf-input-queue-publish', 'perf-assistant-visible-short-circuit', 'perf-row-sweep-transform', 'perf-turn-status-static']) {
  assertMarker('dsh-client-ui-conversation', 'lib/client.js', marker)
}
const runtimeDeps = { '@deepseek-ai/dsh-client-runtime/client': rt }
const conv = load(scope, 'dsh-client-ui-conversation', ['SessionInputShell', 'updateChunk', 'initialState', 'resetForRetry'], runtimeDeps)
{
  const SessionInputShell = conv.__SessionInputShell
  const listeners = new Set()
  let sessionSnapshot = { queue: [], chat: 0 }
  const queue = {
    getSnapshot: () => sessionSnapshot.queue,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
  }
  const notify = () => { for (const fn of [...listeners]) fn() }
  const shell = new SessionInputShell({ queue, defaultSink: async () => ({ kind: 'success' }), commandImages: {} })
  let publishes = 0
  shell.state.subscribe(() => { publishes++ })
  sessionSnapshot = { ...sessionSnapshot, chat: 1 }
  notify()
  notify()
  assert.equal(publishes, 0, 'unrelated session change does not republish')
  const rows = [{ id: 'q1', placement: 'queued' }]
  sessionSnapshot = { ...sessionSnapshot, queue: rows }
  notify()
  assert.equal(publishes, 1, 'queue change republishes')
  assert.equal(shell.snapshot.queue, rows, 'published queue is current')
  notify()
  assert.equal(publishes, 1, 'same queue identity does not republish')
  shell.setDraft('hello')
  assert.equal(shell.snapshot.draft, 'hello', 'draft path still publishes')
  const afterDraft = publishes
  assert.equal(listeners.size, 1)
  shell.dispose()
  assert.equal(listeners.size, 0, 'dispose releases the queue subscription')
  sessionSnapshot = { ...sessionSnapshot, queue: [] }
  notify()
  assert.ok(publishes <= afterDraft + 1, 'no queue republish after dispose')
}

// Chat assembly: the short-circuit leaves every state transition unchanged.
function chunkScript() {
  const chunks = [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: '  ' },
    { type: 'reasoning-delta', index: 0, text: 'think' },
    { type: 'block-start', index: 1, blockType: 'text' },
    { type: 'text-delta', index: 1, text: '' },
    { type: 'text-delta', index: 1, text: 'Hello' },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 2 } },
    { type: 'text-delta', index: 1, text: ' world' },
    { type: 'block-end', index: 1, block: { type: 'text', text: 'Hello world' } },
  ]
  return chunks.map((chunk, i) => ({ event: { type: 'assistant/chunk', seq: 10 + i, time: 100 + i, data: { chunk } } }))
}
function runChunks(mod, init, retry) {
  const states = []
  let state = init
  for (const [i, match] of chunkScript().entries()) {
    state = mod.__updateChunk(state, match)
    states.push(state)
    if (retry && i === 5) {
      state = mod.__resetForRetry(state)
      states.push(state)
    }
  }
  return JSON.stringify(states)
}
if (pristine) {
  const original = load(pristine, 'dsh-client-ui-conversation', ['updateChunk', 'initialState', 'resetForRetry'], runtimeDeps)
  for (const retry of [false, true]) {
    assert.equal(runChunks(conv, conv.__initialState(1, 1), retry), runChunks(original, original.__initialState(1, 1), retry), `chat updateChunk matches original (retry ${retry})`)
  }
}

// --- ui-trajectory ----------------------------------------------------------

for (const marker of ['perf-trajectory-lazy-snapshot', 'perf-assistant-visible-short-circuit']) assertMarker('dsh-client-ui-trajectory', 'lib/client.js', marker)
const traj = load(scope, 'dsh-client-ui-trajectory', ['TrajectorySnapshotBuilder', 'updateChunk', 'initialState'], runtimeDeps)

function stepLocation(turn, step) {
  return { kind: 'step', turn: { turn }, step: { step } }
}
function sampleNodes(variant = 0) {
  const header = (seq, turn, step, tools) => ({
    key: `h${seq}`, anchorSeq: seq, location: stepLocation(turn, step),
    data: { kind: 'request-header', header: { seq, location: stepLocation(turn, step), prompt: { tools, config: { model: 'm' } }, change: seq === 1 ? { kind: 'initial' } : undefined } },
  })
  return [
    header(1, 1, 1, [{ name: 'bash', schema: {} }]),
    { key: 'n2', anchorSeq: 2, location: stepLocation(1, 1), data: { kind: 'node', node: { kind: 'user', seq: 2 } } },
    { key: 'a3', anchorSeq: 3, location: stepLocation(1, 1), data: { kind: 'assistant', node: { kind: 'assistant', seq: 3, turn: 1, step: 1 }, partial: null, request: { purpose: 'assistant', turn: 1, step: 1, startSeq: 3, status: 'done' } } },
    { key: 't4', anchorSeq: 4, location: stepLocation(1, 1), data: { kind: 'tool', root: { kind: 'tool-result', seq: 4, callId: 'c1', call: { name: 'bash' }, subCalls: [] } } },
    { key: 'c5', anchorSeq: 5, location: stepLocation(1, 1), data: { kind: 'compaction', request: { purpose: 'compaction', turn: 1, step: 0, startSeq: 5, status: 'running' } } },
    { key: 'e6', anchorSeq: 6, location: stepLocation(1, 1), data: { kind: 'session-end', seq: 6, time: 60 } },
    header(7, 2, 1, []),
    { key: 'a8', anchorSeq: 8, location: stepLocation(2, 1), data: { kind: 'assistant', node: undefined, partial: { turn: 2, step: 1, blocks: [{ kind: 'text', text: `p${variant}` }] }, request: { purpose: 'assistant', turn: 2, step: 1, startSeq: 8, status: 'running' } } },
    { key: 't9', anchorSeq: 9, location: stepLocation(2, 1), data: { kind: 'tool', root: { callId: 'c2', name: 'bash', subCalls: [] } } },
    { key: 'z10', anchorSeq: 10, location: stepLocation(2, 1), data: { kind: 'turn-end', turn: 2, time: 70, error: variant ? 'boom' : undefined } },
  ]
}
const plain = (snapshot) => JSON.stringify({
  eventNodes: snapshot.eventNodes,
  eventLocations: [...snapshot.eventLocations],
  requests: snapshot.requests,
  callSchemas: [...snapshot.callSchemas],
  partial: snapshot.partial,
  runningCalls: snapshot.runningCalls,
})
{
  const Builder = traj.__TrajectorySnapshotBuilder
  const builder = new Builder()
  let computes = 0
  const compute = builder.computeSnapshot
  builder.computeSnapshot = function (contributions) { computes++; return compute.call(this, contributions) }
  const first = builder.replace({ nodes: sampleNodes(0), timeline: {} })
  const update = { upserts: [sampleNodes(1)[7], sampleNodes(1)[9]], timeline: {} }
  const second = builder.apply(update)
  assert.equal(computes, 0, 'snapshots are not computed until read')
  const nodes = first.eventNodes
  assert.equal(computes, 1, 'first read computes once')
  assert.equal(first.eventNodes, nodes, 'computed members are stable')
  void first.requests; void first.partial
  assert.equal(computes, 1, 'other members reuse the computation')
  assert.notEqual(first, second)
  if (pristine) {
    const Original = load(pristine, 'dsh-client-ui-trajectory', ['TrajectorySnapshotBuilder'], runtimeDeps).__TrajectorySnapshotBuilder
    const reference = new Original()
    const eagerFirst = reference.replace({ nodes: sampleNodes(0), timeline: {} })
    const eagerSecond = reference.apply(update)
    // first was read after apply() rewrote contributions in place: it must still show the pre-apply state.
    assert.equal(plain(first), plain(eagerFirst), 'lazy snapshot matches eager output (read after a later apply)')
    assert.equal(plain(second), plain(eagerSecond), 'lazy snapshot matches eager output after apply')
    assert.notEqual(plain(first), plain(second), 'sample exercises a real change')
    const structural = builder.apply({ upserts: [{ ...sampleNodes(0)[1], key: 'n11', anchorSeq: 11 }], timeline: {} })
    assert.equal(plain(structural), plain(reference.apply({ upserts: [{ ...sampleNodes(0)[1], key: 'n11', anchorSeq: 11 }], timeline: {} })), 'structural apply matches')
    // Trajectory assembly: the short-circuit leaves every state transition unchanged.
    const original = load(pristine, 'dsh-client-ui-trajectory', ['updateChunk', 'initialState'], runtimeDeps)
    assert.equal(runChunks(traj, traj.__initialState(1, 1, 0, 0, true), false), runChunks(original, original.__initialState(1, 1, 0, 0, true), false), 'trajectory updateChunk matches original')
  }
  const keys = Object.keys(first).sort()
  assert.deepEqual(keys, ['callSchemas', 'eventLocations', 'eventNodes', 'partial', 'requests', 'runningCalls'], 'snapshot keeps the six members')
}

// --- ui-workspace -----------------------------------------------------------

assertMarker('dsh-client-ui-workspace', 'lib/client.js', 'perf-session-list-equality')
{
  const ws = load(scope, 'dsh-client-ui-workspace', ['equalSessionListState'], runtimeDeps)
  const eq = ws.__equalSessionListState
  const projectionValues = Object.freeze({ todos: [] })
  const catalog = { entries: [] }
  const jobs = [{ id: 'j' }]
  const build = () => ({
    ids: ['a', 'b'],
    byId: {
      a: { id: 'a', displayTitle: 'A', running: false, blank: false, updatedAt: 1, projectionValues, cwd: 'C:/x', origin: 'user' },
      b: { id: 'b', displayTitle: 'B', running: true, blank: false, updatedAt: 2, parentId: 'a', origin: 'subagent', pendingInteraction: 'approval' },
    },
    current: 'a',
    phase: 'ready',
    subagentsByParent: { a: catalog },
    jobsBySession: { b: jobs },
    currentAddress: undefined,
  })
  assert.equal(eq(build(), build()), true, 'content-equal snapshots are equal')
  const mutations = [
    ['ids order', (s) => { s.ids = ['b', 'a'] }],
    ['id added', (s) => { s.ids = [...s.ids, 'c'] }],
    ['current', (s) => { s.current = 'b' }],
    ['phase', (s) => { s.phase = 'pending' }],
    ['currentAddress', (s) => { s.currentAddress = { parentSessionId: 'a', childSessionId: 'b', mode: 'x' } }],
    ['catalog identity', (s) => { s.subagentsByParent = { a: { entries: [] } } }],
    ['catalog added', (s) => { s.subagentsByParent = { a: catalog, b: catalog } }],
    ['jobs identity', (s) => { s.jobsBySession = { b: [{ id: 'j' }] } }],
    ['byId entry added', (s) => { s.byId = { ...s.byId, c: { id: 'c' } } }],
    ['extra top-level member', (s) => { s.extra = 1 }],
  ]
  for (const field of ['displayTitle', 'running', 'blank', 'updatedAt', 'projectionValues', 'cwd', 'origin', 'completed', 'title', 'parentId', 'agentPreset', 'pendingInteraction']) {
    mutations.push([`byId.${field}`, (s) => { s.byId.a = { ...s.byId.a, [field]: field === 'projectionValues' ? {} : `changed-${field}` } }])
  }
  mutations.push(['byId field removed', (s) => { const { cwd: _cwd, ...rest } = s.byId.a; s.byId.a = rest }])
  for (const [label, mutate] of mutations) {
    const next = build()
    mutate(next)
    assert.equal(eq(build(), next), false, `${label} change is detected`)
  }
  assert.equal(eq(undefined, build()), false)
}

// --- row sweeps, turn status, state dot: CSS stays balanced ------------------

function embeddedCss(pkg) {
  const source = readFileSync(join(scope, pkg, 'lib', 'client.js'), 'utf8')
  return [...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map((m) => JSON.parse(m[1]))
}
for (const [pkg, frames] of [
  ['dsh-client-ui-conversation', ['QWLzlG_dsh-reasoning-row-sweep', '_Xvjua_dsh-command-row-sweep']],
  ['dsh-client-ui-tool', ['o3BgMG_dsh-tool-row-sweep', 'CY-8Ka_dsh-bash-row-sweep']],
  ['dsh-client-ui-skill', ['iWrAna_dsh-skill-row-sweep']],
]) {
  assertMarker(pkg, 'lib/client.js', 'perf-row-sweep-transform')
  const sheets = embeddedCss(pkg)
  assert.ok(sheets.length > 0)
  for (const css of sheets) assert.ok(cssBalanced(css), `${pkg}: embedded CSS balanced`)
  const all = sheets.join('\n')
  for (const name of frames) {
    assert.ok(all.includes(`@keyframes ${name}{0%{transform:translateX(0)}90%,to{transform:translateX(100%)}}`), `${name}: transform keyframes`)
    assert.ok(!all.includes(`@keyframes ${name}{0%{left:`), `${name}: left keyframes gone`)
    assert.ok(all.includes(`width:calc(100% + 300px);background-size:300px 100%;background-repeat:no-repeat;animation:2.6s ease-out infinite ${name}`), `${name}: widened band`)
  }
}
assert.ok(embeddedCss('dsh-client-ui-conversation').join('\n').includes('animation:none;display:inline-flex}/* dsh-core-override: perf-turn-status-static */'), 'turn status static')
{
  const cssFile = join(scope, 'dsh-web-frontend', 'dist', 'assets', 'index-C6eRlFa6.css')
  if (existsSync(cssFile)) {
    const css = readFileSync(cssFile, 'utf8')
    assert.ok(css.includes('dsh-core-override: perf-state-dot-static'), 'state dot marker')
    assert.ok(css.includes('._cell_10orb_54{fill:currentColor;opacity:.6;animation:none}'), 'state dot static')
    assert.ok(cssBalanced(css), 'frontend CSS balanced')
  }
}

console.log('smoke-performance-011: all checks passed')
