import { afterEach, describe, expect, it } from 'vitest'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import HttpServer from '@deepseek-ai/dsh-host-webserver'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as WorktreeStudio from '../src/index.ts'
import { createRepositoryFixture, removeFixture, type RepositoryFixture } from './helpers.ts'

let context: Context | undefined
let fixture: RepositoryFixture | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (fixture !== undefined) await removeFixture(fixture.root)
  fixture = undefined
})

async function start(): Promise<{ readonly baseUrl: string; readonly repository: string }> {
  fixture = await createRepositoryFixture()
  context = new Context()
  await context.plugin(HttpServer, { host: '127.0.0.1', port: 0 })
  await context.plugin(LocalSubprocessRuntime)
  await context.plugin(WorktreeStudio, {
    managedRoot: fixture.managedRoot,
    statePath: fixture.statePath,
    gitTimeoutMs: 10_000,
    terminationGraceMs: 200,
    validationTimeoutMs: 10_000,
    maxOutputBytes: 128 * 1024,
    reviewMaxBytes: 64 * 1024,
    requireValidation: true,
    allowDelivery: false,
    cloneRoot: join(fixture.root, 'clone'),
    cloneTimeoutMs: 10_000,
  })
  return {
    baseUrl: `http://127.0.0.1:${String(context.webServer.port)}`,
    repository: fixture.repository,
  }
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>
}

async function requestWithHost(url: string, host: string): Promise<number | undefined> {
  const target = new URL(url)
  return await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      headers: { host },
    }, (response) => {
      response.resume()
      response.once('end', () => { resolve(response.statusCode) })
    })
    request.once('error', reject)
    request.end()
  })
}

describe('branchline Web route', () => {
  it('serves the real loopback route and creates a task through its JSON API', async () => {
    const running = await start()
    const origin = running.baseUrl
    const createdResponse = await fetch(`${running.baseUrl}/api/dsh-branchline`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({
        operation: 'create',
        repository: running.repository,
        title: 'API task',
        validationCommand: `${JSON.stringify(process.execPath)} -e "process.exit(0)"`,
      }),
    })
    expect(createdResponse.status).toBe(200)
    const created = await json(createdResponse)
    expect(created).toMatchObject({
      ok: true,
      value: {
        title: 'API task',
        phase: 'active',
        exists: true,
      },
    })

    const dashboardResponse = await fetch(
      `${running.baseUrl}/api/dsh-branchline?repository=${encodeURIComponent(running.repository)}`,
      { headers: { origin, 'sec-fetch-site': 'same-origin' } },
    )
    expect(dashboardResponse.status).toBe(200)
    expect(await json(dashboardResponse)).toMatchObject({
      ok: true,
      value: { tasks: [{ title: 'API task' }] },
    })
  })

  it('rejects cross-site, rebound-host, and unsupported-method requests', async () => {
    const running = await start()
    const crossSite = await fetch(`${running.baseUrl}/api/dsh-branchline`, {
      headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
    })
    expect(crossSite.status).toBe(403)

    const rebound = await requestWithHost(`${running.baseUrl}/api/dsh-branchline`, 'attacker.example')
    expect(rebound).toBe(403)

    const unsupported = await fetch(`${running.baseUrl}/api/dsh-branchline`, {
      method: 'DELETE',
      headers: { origin: running.baseUrl, 'sec-fetch-site': 'same-origin' },
    })
    expect(unsupported.status).toBe(405)
  })

  it('rejects create requests that mix or misuse repository sources', async () => {
    const running = await start()
    const origin = running.baseUrl
    const post = (body: Record<string, unknown>): Promise<Response> => fetch(`${running.baseUrl}/api/dsh-branchline`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify(body),
    })

    const mixed = await post({
      operation: 'create',
      repository: running.repository,
      cloneFrom: 'owner/repo',
      title: 'mixed sources',
    })
    expect(mixed.status).toBe(400)
    expect(await json(mixed)).toMatchObject({ ok: false, error: { code: 'invalid-input' } })

    const invalidSource = await post({
      operation: 'create',
      cloneFrom: 'not a source',
      title: 'invalid clone source',
    })
    expect(invalidSource.status).toBe(400)
    expect(await json(invalidSource)).toMatchObject({ ok: false, error: { code: 'invalid-input' } })

    const missingSource = await post({ operation: 'create', title: 'no source' })
    expect(missingSource.status).toBe(400)
    expect(await json(missingSource)).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
  })
})
