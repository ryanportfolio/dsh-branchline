// Smoke test for apply-performance.ps1 output. Loads the patched bundles from a
// scratch copy (never the live npx cache) and exercises the patched code paths.
//
// Usage: node smoke-performance.mjs <node_modules/@deepseek-ai dir>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const scope = process.argv[2]
if (!scope) throw new Error('usage: node smoke-performance.mjs <node_modules/@deepseek-ai dir>')
const read = (pkg, file) => readFileSync(join(scope, pkg, 'lib', file), 'utf8')
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

// --- session-controller: evaluate the browser bundle with stub dependencies ---

function loadSessionController() {
  let source = read('dsh-api-session-controller', 'client.js')
  for (const marker of ['perf-list-cache-linear', 'perf-session-park']) {
    assert.ok(source.includes(`dsh-core-override: ${marker}`), `${marker} marker present`)
  }
  // Expose the internal classes to this test only.
  source = source.replace('\t\treturn module.exports;\n\t}\n});', '\t\texports.__Session = Session;\n\t\texports.__ClientSessions = ClientSessions;\n\t\texports.__SessionManager = SessionManager;\n\t\treturn module.exports;\n\t}\n});')
  let factory
  const window = { __ModuleLoader__: { load: (entry) => { factory = entry.factory } } }
  const stub = new Proxy(function () {}, { get: (_t, key) => key === Symbol.toPrimitive ? undefined : stub, apply: () => stub, construct: () => ({}) })
  new Function('window', source)(window)
  assert.equal(typeof factory, 'function', 'bundle registered a factory')
  return factory(() => stub)
}

const sc = loadSessionController()
const { __Session: Session, __ClientSessions: ClientSessions, __SessionManager: SessionManager } = sc
assert.equal(typeof Session.prototype.park, 'function', 'Session.park exists')
assert.equal(typeof ClientSessions.prototype.schedulePark, 'function', 'ClientSessions.schedulePark exists')

function fakeSession(overrides = {}) {
  const s = Object.create(Session.prototype)
  let disposed = 0
  let dirty = 0
  Object.assign(s, {
    openState: 'open', pendingSubmissions: [], submissionSettlements: new Map(), loadingOlder: false,
    jumpPromise: null, openGeneration: 3, openPromise: null, openError: null, baseSeq: 7,
    events: { dispose: async () => { disposed++ } },
    notifier: { markDirty: () => { dirty++ } },
  }, overrides)
  return { s, disposed: () => disposed, dirty: () => dirty }
}

{
  const { s, disposed, dirty } = fakeSession()
  assert.equal(s.park(), true, 'open session parks')
  await tick()
  assert.equal(s.openState, 'cold')
  assert.equal(s.events, undefined)
  assert.equal(s.openGeneration, 4, 'park invalidates in-flight opens')
  assert.equal(disposed(), 1, 'park disposes the history stream')
  assert.equal(dirty(), 1)
  assert.equal(s.park(), false, 'cold session does not park twice')
}
for (const [label, overrides] of [
  ['pending submission', { pendingSubmissions: [{ requestId: 'r' }] }],
  ['unsettled submission', { submissionSettlements: new Map([['r', {}]]) }],
  ['loading older', { loadingOlder: true }],
  ['jump in flight', { jumpPromise: Promise.resolve() }],
]) {
  const { s, disposed } = fakeSession(overrides)
  assert.equal(s.park(), false, `${label} blocks park`)
  assert.equal(s.openState, 'open')
  assert.equal(disposed(), 0)
}
{
  const { s } = fakeSession({ events: { dispose: async () => { throw new Error('boom') } } })
  const errors = []
  const original = console.error
  console.error = (...args) => errors.push(args)
  try { assert.equal(s.park(), true); await tick() } finally { console.error = original }
  assert.equal(errors.length, 1, 'dispose failure is logged, not thrown')
}

// followCurrent + park scheduling with a short grace period.
{
  const sessions = new Map()
  const opened = []
  const cs = Object.create(ClientSessions.prototype)
  let snapshot = { current: 'a', byId: { a: {}, b: {}, c: {} } }
  Object.assign(cs, {
    parkTimers: new Map(), parkGraceMs: 20, deferredRemovals: new Set(), watched: undefined,
    scopes: new Map(),
    list: { getSnapshot: () => snapshot },
    manager: { refreshSubagents() {} },
  })
  cs.eligible = () => true
  cs.resolve = (id) => {
    if (!cs.scopes.has(id)) {
      const { s } = fakeSession({ openState: 'cold', events: undefined })
      s.open = () => { opened.push(id); s.openState = 'open'; s.events = { dispose: async () => {} } }
      sessions.set(id, s)
      cs.scopes.set(id, { session: s })
    }
    return cs.scopes.get(id)
  }
  cs.followCurrent()
  assert.equal(cs.parkTimers.size, 0, 'first stage schedules nothing')
  snapshot = { ...snapshot, current: 'b' }
  cs.followCurrent()
  assert.deepEqual([...cs.parkTimers.keys()], ['a'], 'previous occupant scheduled')
  snapshot = { ...snapshot, current: 'a' }
  cs.followCurrent()
  assert.deepEqual([...cs.parkTimers.keys()], ['b'], 'returning to a cancels its timer')
  await tick(40)
  assert.equal(sessions.get('b').openState, 'cold', 'b parked after grace')
  assert.equal(sessions.get('a').openState, 'open', 'staged a stays open')
  // A busy session retries until it can park.
  sessions.get('a').pendingSubmissions = [{ requestId: 'r' }]
  snapshot = { ...snapshot, current: 'c' }
  cs.followCurrent()
  await tick(40)
  assert.equal(sessions.get('a').openState, 'open', 'busy a not parked')
  assert.ok(cs.parkTimers.has('a'), 'busy a rescheduled')
  sessions.get('a').pendingSubmissions = []
  await tick(40)
  assert.equal(sessions.get('a').openState, 'cold', 'a parked once settled')
  assert.equal(cs.parkTimers.size, 0)
  // Re-staging a parked session reopens it through the original open() path.
  snapshot = { ...snapshot, current: 'a' }
  cs.followCurrent()
  assert.equal(sessions.get('a').openState, 'open', 'reopen on return')
  assert.deepEqual(opened, ['a', 'b', 'a', 'c', 'a'], 'stage moves call open()')
  // Clearing the selection releases the stage: the old occupant parks, and reselecting it reopens.
  snapshot = { ...snapshot, current: undefined }
  cs.followCurrent()
  assert.equal(cs.watched, undefined, 'empty stage clears watched')
  assert.ok(cs.parkTimers.has('a'), 'cleared occupant scheduled')
  await tick(40)
  assert.equal(sessions.get('a').openState, 'cold', 'a parked after selection cleared')
  snapshot = { ...snapshot, current: 'a' }
  cs.followCurrent()
  assert.equal(sessions.get('a').openState, 'open', 'reselect after clear reopens')
  cs.followCurrent()
  assert.equal(opened.at(-1), 'a')
  for (const t of cs.parkTimers.values()) clearTimeout(t)
}

// List cache prune: linear reconciliation keeps behavior.
{
  assert.match(SessionManager.prototype.buildListSnapshot.toString(), /itemIds\.has\(id\)/)
}

// --- gateway cancellableStream: evaluate the patched function in isolation ---

{
  const src = read('dsh-api-gateway', 'index.js')
  assert.ok(src.includes('dsh-core-override: perf-stream-abort-per-read'))
  const start = src.indexOf('async function* cancellableStream(')
  const end = src.indexOf('function rpcFailure(', start)
  const body = src.slice(start, end)
  class RemoteError extends Error { constructor(code, message, details, options) { super(message, options); this.code = code } }
  const cancellableStream = new Function('RemoteError', `${body}; return cancellableStream`)(RemoteError)

  async function* numbers(n) { for (let i = 0; i < n; i++) yield i }
  const out = []
  for await (const v of cancellableStream(numbers(5), 'x/y', new AbortController().signal)) out.push(v)
  assert.deepEqual(out, [0, 1, 2, 3, 4], 'plain stream completes')

  // Abort while a read is pending rejects that read with remoteCancelled.
  const ac = new AbortController()
  let returned = false
  const hanging = { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}), return: async () => { returned = true; return { done: true } } }) }
  const it = cancellableStream(hanging, 'x/y', ac.signal)
  const pending = it.next()
  await tick()
  ac.abort('stop')
  await assert.rejects(pending, (e) => e.code === 'gateway/cancelled')
  assert.ok(returned, 'source iterator returned')

  // Abort between reads throws at the next loop top.
  const ac2 = new AbortController()
  const it2 = cancellableStream(numbers(10), 'x/y', ac2.signal)
  assert.deepEqual(await it2.next(), { value: 0, done: false })
  ac2.abort('stop')
  await assert.rejects(it2.next(), (e) => e.code === 'gateway/cancelled')

  // Already-aborted signal fails before the first read.
  const ac3 = new AbortController(); ac3.abort('early')
  await assert.rejects(cancellableStream(numbers(1), 'x/y', ac3.signal).next(), (e) => e.code === 'gateway/cancelled')

  // Long stream: no unhandled rejections, completes.
  let count = 0
  for await (const _ of cancellableStream(numbers(20000), 'x/y', new AbortController().signal)) count++
  assert.equal(count, 20000)
}

// --- client UI bundles: markers present (syntax already checked by node --check) ---

assert.ok(read('dsh-client-ui-conversation', 'client.js').includes('dsh-core-override: perf-input-queue-unsubscribe'))
assert.ok(read('dsh-client-ui-sidebar-right', 'client.js').includes('dsh-core-override: perf-sidebar-adoption-release'))

console.log('smoke-performance: all checks passed')
