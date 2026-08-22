import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const OUT = path.join(ROOT, 'assets/readme')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const items = JSON.parse(fs.readFileSync(path.join(HERE, 'items.json'), 'utf8'))

/*
Constraint contract
- Conceit: Branchline routes origin/HEAD to isolated task sidings.
- Orange marks the live remote commit and active route only.
- Solid rails are verified Git paths; dashed rails are available task routes.
- One monospace type system. No external requests, scripts, hover state, or opaque page background.
- Every panel has wide light, wide dark, narrow light, and narrow dark variants.
- Reduced motion restores the complete route and visible labels.
*/

const THEMES = {
  light: { ink: '#1f2328', mute: '#59636e', rule: '#d1d9e0', soft: '#f6f8fa', accent: '#bc4c00', accentSoft: '#fff1e5' },
  dark: { ink: '#f0f6fc', mute: '#9198a1', rule: '#3d444d', soft: '#161b22', accent: '#f0883e', accentSoft: '#2b1a10' },
}
const MONO = "ui-monospace,'SF Mono','Cascadia Mono',Menlo,Consolas,'Liberation Mono',monospace"
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const testFiles = fs.readdirSync(path.join(ROOT, 'tests')).filter(name => /\.spec\.tsx?$/u.test(name))
const testCount = testFiles.reduce((sum, name) => {
  const source = fs.readFileSync(path.join(ROOT, 'tests', name), 'utf8')
  return sum + source.split(/\r?\n/u).filter(line => /^\s+it(?:\.|\()/u.test(line)).length
}, 0)
const facts = {
  version: pkg.version,
  tests: testCount,
  testFiles: testFiles.length,
  dependencies: Object.keys(pkg.dependencies ?? {}).length,
  stages: items.length,
}

const baseCss = theme => `
text{font-family:${MONO};fill:${theme.ink}}
.mute{fill:${theme.mute}}.accent{fill:${theme.accent}}
.rail{fill:none;stroke:${theme.rule};stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.rail-strong{fill:none;stroke:${theme.ink};stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.route{fill:none;stroke:${theme.accent};stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:9 8;animation:flow 4.8s linear infinite}
.node{fill:${theme.soft};stroke:${theme.rule};stroke-width:2}.node-live{fill:${theme.accentSoft};stroke:${theme.accent};stroke-width:2.5;animation:pulse 2.4s ease-in-out infinite}
.tag{fill:${theme.soft};stroke:${theme.rule}}.tag-live{fill:${theme.accentSoft};stroke:${theme.accent}}
@keyframes flow{to{stroke-dashoffset:-68}}@keyframes pulse{0%,100%{opacity:.62}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.route{stroke-dashoffset:0}.node-live{opacity:1}}
`

function svg(width, height, label, theme, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}">
<style>${baseCss(theme)}</style>
${body}
</svg>\n`
}

function metric(x, y, value, label, theme, width = 138) {
  return `<rect class="tag" x="${x}" y="${y}" width="${width}" height="48" rx="4"/>
<text x="${x + 12}" y="${y + 20}" font-size="16" font-weight="700">${esc(value)}</text>
<text class="mute" x="${x + 12}" y="${y + 37}" font-size="9" letter-spacing="1.1">${esc(label)}</text>`
}

function masthead(theme, narrow) {
  if (narrow) {
    return svg(390, 470, 'DSH Branchline routes the latest remote default branch into an isolated DSH task while the primary checkout stays untouched.', theme, `
<path class="rail-strong" d="M24 28h32l12 12h30"/><circle class="node-live" cx="24" cy="28" r="5"/>
<text class="mute" x="112" y="33" font-size="10" letter-spacing="1.5">DSH BRANCHLINE / ${esc(facts.version)}</text>
<text x="20" y="91" font-size="29" font-weight="800" letter-spacing="-1.1">FRESH TRACKS</text>
<text x="20" y="124" font-size="29" font-weight="800" letter-spacing="-1.1">FOR EVERY TASK</text>
<text class="mute" x="20" y="151" font-size="11">origin/HEAD -> exact commit -> isolated Session</text>
<path class="rail" d="M58 186v186"/><path class="route" d="M58 186v58c0 20 18 24 35 24h78c18 0 34 10 34 30v38"/>
<circle class="node-live" cx="58" cy="186" r="8"/><circle class="node-live" cx="58" cy="244" r="8"/><circle class="node" cx="205" cy="336" r="8"/>
<text class="accent" x="78" y="190" font-size="11" font-weight="700">ORIGIN/HEAD</text>
<text x="78" y="248" font-size="11" font-weight="700">PINNED SHA</text>
<text x="225" y="340" font-size="11" font-weight="700">TASK / N</text>
<path class="rail-strong" d="M58 372h278"/><circle class="node" cx="58" cy="372" r="7"/><circle class="node" cx="336" cy="372" r="7"/>
<text class="mute" x="70" y="397" font-size="10">PRIMARY CHECKOUT / UNTOUCHED</text>
${metric(20, 414, `${facts.tests}`, 'TESTS', theme, 104)}
${metric(143, 414, `${facts.stages}`, 'ROUTE STEPS', theme, 116)}
${metric(278, 414, `${facts.dependencies}`, 'RUNTIME DEP', theme, 92)}
`)
  }

  return svg(880, 350, 'DSH Branchline routes the latest remote default branch into isolated DSH tasks while the primary checkout stays untouched.', theme, `
<path class="rail-strong" d="M28 28h34l12 12h34"/><circle class="node-live" cx="28" cy="28" r="5"/>
<text class="mute" x="126" y="33" font-size="11" letter-spacing="1.8">DSH BRANCHLINE · ${esc(facts.version)}</text>
<text x="28" y="94" font-size="42" font-weight="800" letter-spacing="-1.8">FRESH TRACKS FOR EVERY TASK</text>
<text class="mute" x="30" y="123" font-size="14">Route GitHub's current default branch into an isolated DSH Workspace and Session.</text>

<path class="rail" d="M48 210h764"/>
<path class="rail" d="M430 210c36 0 40-45 82-45h300M430 210c36 0 40 45 82 45h300"/>
<path class="route" d="M48 210h382c36 0 40-45 82-45h300"/>
<circle class="node-live" cx="48" cy="210" r="9"/><circle class="node-live" cx="430" cy="210" r="9"/>
<circle class="node" cx="812" cy="165" r="9"/><circle class="node" cx="812" cy="210" r="9"/><circle class="node" cx="812" cy="255" r="9"/>
<text class="accent" x="30" y="190" font-size="11" font-weight="700">ORIGIN/HEAD</text>
<text x="382" y="190" font-size="11" font-weight="700">EXACT COMMIT</text>
<text x="676" y="148" font-size="11" font-weight="700">TASK / ACTIVE</text>
<text class="mute" x="676" y="238" font-size="11">TASK / NEXT</text>
<text class="mute" x="676" y="283" font-size="11">TASK / N</text>

<path class="rail-strong" d="M48 315h764"/><circle class="node" cx="48" cy="315" r="8"/><circle class="node" cx="812" cy="315" r="8"/>
<text class="mute" x="64" y="337" font-size="10" letter-spacing="1.1">PRIMARY CHECKOUT REMAINS ON ITS CURRENT BRANCH WITH ITS CURRENT FILES</text>
${metric(566, 22, `${facts.tests}`, 'TESTS', theme)}
${metric(714, 22, `${facts.dependencies}`, 'RUNTIME DEP', theme)}
`)
}

function routePanel(theme, narrow) {
  if (narrow) {
    const rows = items.map((item, index) => {
      const y = 52 + index * 92
      return `<circle class="${index === 0 ? 'node-live' : 'node'}" cx="44" cy="${y}" r="10"/>
<text class="accent" x="70" y="${y - 9}" font-size="9" font-weight="700" letter-spacing="1.2">${esc(item.index)} / ${esc(item.signal)}</text>
<text x="70" y="${y + 13}" font-size="16" font-weight="700">${esc(item.title.toUpperCase())}</text>
<text class="mute" x="70" y="${y + 32}" font-size="10">${esc(item.code)}</text>`
    }).join('\n')
    return svg(390, 420, 'Four-step route: fetch the remote default, create an isolated checkout, open a native DSH session, and keep the branch for review.', theme, `
<text x="20" y="24" font-size="11" font-weight="700" letter-spacing="1.4">THE ROUTE</text>
<path class="rail" d="M44 52v276"/><path class="route" d="M44 52v276"/>
${rows}
<rect class="tag-live" x="20" y="370" width="350" height="34" rx="4"/>
<text class="accent" x="34" y="392" font-size="11" font-weight="700">PRIMARY CHECKOUT: NO SWITCH / RESET / STASH / CLEAN</text>
`)
  }

  const cells = items.map((item, index) => {
    const x = 54 + index * 204
    return `<circle class="${index === 0 ? 'node-live' : 'node'}" cx="${x}" cy="86" r="10"/>
<text class="accent" x="${x - 14}" y="51" font-size="10" font-weight="700">${esc(item.index)}</text>
<text x="${x - 18}" y="126" font-size="12" font-weight="700">${esc(item.signal)}</text>
<text class="mute" x="${x - 18}" y="146" font-size="10">${esc(item.code)}</text>`
  }).join('\n')
  return svg(880, 205, 'Four-step route: fetch the remote default, create an isolated checkout, open a native DSH session, and keep the branch for review.', theme, `
<text x="28" y="26" font-size="11" font-weight="700" letter-spacing="1.5">THE ROUTE / ${facts.stages} VERIFIED STAGES</text>
<path class="rail" d="M54 86h612c38 0 44 42 82 42h78"/>
<path class="route" d="M54 86h612c38 0 44 42 82 42h78"/>
${cells}
<rect class="tag-live" x="28" y="166" width="824" height="27" rx="4"/>
<text class="accent" x="42" y="184" font-size="10" font-weight="700" letter-spacing=".7">PRIMARY CHECKOUT: NO SWITCH / RESET / STASH / CLEAN</text>
`)
}

fs.mkdirSync(OUT, { recursive: true })
for (const [name, builder] of Object.entries({ masthead, route: routePanel })) {
  for (const [themeName, theme] of Object.entries(THEMES)) {
    fs.writeFileSync(path.join(OUT, `${name}-${themeName}.svg`), builder(theme, false))
    fs.writeFileSync(path.join(OUT, `${name}-narrow-${themeName}.svg`), builder(theme, true))
  }
}

const expected = 2 * 2 * 2
const written = fs.readdirSync(OUT).filter(name => /^(masthead|route)(?:-narrow)?-(?:light|dark)\.svg$/u.test(name)).length
if (written !== expected) throw new Error(`panel count mismatch: expected ${expected}, found ${written}`)

fs.writeFileSync(path.join(OUT, 'facts.json'), `${JSON.stringify(facts, null, 2)}\n`)
process.stdout.write(`panels: ${written}; tests: ${facts.tests}; test files: ${facts.testFiles}\n`)
