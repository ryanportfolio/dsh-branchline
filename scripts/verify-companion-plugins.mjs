#!/usr/bin/env node
// Smoke-verifies the companion DSH plugin packages under packages/: manifest
// presence, client bundle syntax, and a live host-module import.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const plugins = readdirSync(resolve('packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('dsh-'))
  .map((entry) => entry.name)
  .sort()
let failures = 0

for (const name of plugins) {
  const dir = resolve('packages', name)
  const manifestPath = resolve(dir, 'package.json')
  const patch = resolve(dir, 'cordis.patch.yml')
  const host = resolve(dir, 'lib/index.js')
  try {
    for (const file of [manifestPath, patch, host]) {
      if (!existsSync(file)) throw new Error(`missing ${file}`)
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.name !== name) throw new Error(`manifest name mismatch: ${String(manifest.name)}`)
    if (manifest.dsh?.client !== undefined) {
      const client = resolve(dir, 'lib/client.cjs')
      if (!existsSync(client)) throw new Error(`missing ${client}`)
      execFileSync(process.execPath, ['--check', client], { stdio: 'pipe' })
    }
    const hostModule = await import(pathToFileURL(host))
    if (hostModule.name !== name) throw new Error(`host name mismatch: ${hostModule.name}`)
    if (!Array.isArray(hostModule.inject)) throw new Error('host inject list missing')
    console.log(`ok: ${name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

if (failures > 0) process.exit(1)
process.stdout.write(`companion plugins verified: ${plugins.length}
`)
