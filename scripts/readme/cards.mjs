import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const OUT = path.join(ROOT, 'assets/readme')
const items = JSON.parse(fs.readFileSync(path.join(HERE, 'items.json'), 'utf8'))

const THEMES = {
  light: { ink: '#1f2328', mute: '#59636e', rule: '#d1d9e0', soft: '#f6f8fa', accent: '#bc4c00', accentSoft: '#fff1e5' },
  dark: { ink: '#f0f6fc', mute: '#9198a1', rule: '#3d444d', soft: '#161b22', accent: '#f0883e', accentSoft: '#2b1a10' },
}
const MONO = "ui-monospace,'SF Mono','Cascadia Mono',Menlo,Consolas,'Liberation Mono',monospace"
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function wrap(text, max) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/u)) {
    const next = line === '' ? word : `${line} ${word}`
    if (next.length > max && line !== '') {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function card(item, theme, narrow) {
  const width = narrow ? 180 : 410
  const height = narrow ? 206 : 165
  const titleSize = narrow ? 14 : 19
  const lines = wrap(item.copy, narrow ? 22 : 49).slice(0, narrow ? 4 : 2)
  const copyY = narrow ? 91 : 92
  const copy = lines.map((line, index) => `<text class="mute" x="18" y="${copyY + index * 18}" font-size="${narrow ? 10 : 11}">${esc(line)}</text>`).join('\n')
  const codeY = narrow ? 177 : 139
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(`${item.index}. ${item.title}. ${item.copy}`)}">
<style>
text{font-family:${MONO};fill:${theme.ink}}.mute{fill:${theme.mute}}.accent{fill:${theme.accent}}
.rule{stroke:${theme.rule};stroke-width:1.5}.signal{fill:${theme.accent};animation:pulse 2.4s ease-in-out infinite}
.code{fill:${theme.soft};stroke:${theme.rule}}@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.signal{opacity:1}}
</style>
<line class="rule" x1="18" y1="34" x2="${width - 18}" y2="34"/>
<circle class="signal" cx="18" cy="34" r="4"/>
<text class="accent" x="30" y="20" font-size="9" font-weight="700" letter-spacing="1.2">${esc(item.index)} / ${esc(item.signal)}</text>
<text x="18" y="67" font-size="${titleSize}" font-weight="800">${esc(item.title.toUpperCase())}</text>
${copy}
<rect class="code" x="18" y="${codeY - 17}" width="${width - 36}" height="29" rx="3"/>
<text x="29" y="${codeY + 2}" font-size="${narrow ? 9 : 10}">${esc(item.code)}</text>
</svg>\n`
}

fs.mkdirSync(OUT, { recursive: true })
for (const item of items) {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    fs.writeFileSync(path.join(OUT, `card-${item.id}-${themeName}.svg`), card(item, theme, false))
    fs.writeFileSync(path.join(OUT, `card-${item.id}-narrow-${themeName}.svg`), card(item, theme, true))
  }
}

const expected = items.length * 4
const written = fs.readdirSync(OUT).filter(name => /^card-.+-(?:light|dark)\.svg$/u.test(name)).length
if (written !== expected) throw new Error(`card count mismatch: expected ${expected}, found ${written}`)
process.stdout.write(`cards: ${written}; items: ${items.length}\n`)
