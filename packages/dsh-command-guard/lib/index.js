/** Permanent host-only shell guard. No subprocess hooks or global overrides. */
import { checkCommand, blocked } from './policy.js'

export const name = 'dsh-command-guard'
export const inject = ['shell']
const STATE = Symbol.for('dsh-command-guard.method-state.v1')
const ROUTE = '/api/dsh-command-guard/status'

function methodOwner(service, method) {
  for (let cursor = service; cursor !== null; cursor = Object.getPrototypeOf(cursor)) {
    if (Object.hasOwn(cursor, method)) return cursor
  }
  throw new Error(`dsh-command-guard: cannot attach shell.${method}`)
}

/** Method owners, rather than per-context Cordis proxies, are shared by callers. */
export function installGuard(shell, check = checkCommand) {
  const installed = []
  try {
    for (const method of ['run', 'start']) {
      const owner = methodOwner(shell, method)
      const descriptor = Object.getOwnPropertyDescriptor(owner, method)
      if (typeof descriptor?.value !== 'function' || !descriptor.configurable) throw new Error(`dsh-command-guard: shell.${method} is not replaceable`)
      let states = Object.getOwnPropertyDescriptor(owner, STATE)?.value
      if (!states) {
        states = new Map()
        Object.defineProperty(owner, STATE, { configurable: true, value: states })
      }
      let state = states.get(method)
      if (state) {
        if (Object.getOwnPropertyDescriptor(owner, method)?.value !== state.wrapper) throw new Error(`dsh-command-guard: shell.${method} was replaced`)
      } else {
        state = { owners: 0, descriptor, wrapper: undefined }
        state.wrapper = function (...args) {
          const command = args[0]?.command
          if (typeof command !== 'string') throw blocked('missing shell command')
          check(command)
          // Do not await, clone, or reinterpret results: start returns a live handle.
          return Reflect.apply(descriptor.value, this, args)
        }
        Object.defineProperty(owner, method, { ...descriptor, value: state.wrapper })
        states.set(method, state)
      }
      state.owners++
      let disposed = false
      installed.push({
        attached: () => Object.getOwnPropertyDescriptor(owner, method)?.value === state.wrapper,
        dispose() {
          if (disposed) return
          disposed = true
          if (--state.owners !== 0) return
          if (Object.getOwnPropertyDescriptor(owner, method)?.value === state.wrapper) Object.defineProperty(owner, method, state.descriptor)
          states.delete(method)
          if (!states.size) delete owner[STATE]
        },
      })
    }
  } catch (error) {
    for (const entry of installed.reverse()) entry.dispose()
    throw error
  }
  return {
    attached: () => installed.every((entry) => entry.attached()),
    dispose: () => { for (const entry of installed) entry.dispose() },
  }
}

export function apply(ctx, config = {}) {
  let guard
  ctx.effect(() => {
    guard = installGuard(typeof ctx.get === 'function' ? ctx.get('shell') : ctx.shell)
    return () => guard.dispose()
  }, 'dsh-command-guard.shell')
  if (config.statusEndpoint === true) {
    ctx.inject(['webServer'], (webCtx) => webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact', path: ROUTE,
      handler(request, response) {
        const allowed = isLoopbackSameOrigin(request)
        const status = !allowed ? 403 : request.method !== 'GET' ? 405 : 200
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
        response.end(JSON.stringify(status === 200
          ? { name, version: 1, attached: guard?.attached() === true, methods: ['run', 'start'] }
          : { error: status === 403 ? 'loopback same-origin access required' : 'GET required' }))
      },
    }), 'dsh-command-guard.status'))
  }
}

function isLoopbackSameOrigin(request) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket?.remoteAddress)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  try {
    const host = new URL(`http://${request.headers.host}`)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)) return false
    return request.headers.origin === undefined || new URL(request.headers.origin).host === host.host
  } catch { return false }
}
