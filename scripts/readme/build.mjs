import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const steps = [
  ['panels.mjs', 'theme-aware switchyard panels from repository facts'],
  ['cards.mjs', 'four workflow cards with four variants each'],
  ['readme.mjs', 'README assembly and link/asset gates'],
]

for (const [file, purpose] of steps) {
  process.stderr.write(`\n-> ${file} (${purpose})\n`)
  execFileSync(process.execPath, [path.join(HERE, file)], { cwd: ROOT, stdio: 'inherit' })
}
