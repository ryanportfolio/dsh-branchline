// Stills and error check for a scrubbable animation page (see ../references/verify-export.md).
// Usage: node stills.mjs <file-or-url> <t1,t2,...> <out-dir> [--selector #stage]
// The page must expose window.__anim = { seek(t), pause() }. Runs headed Chrome parked offscreen,
// because headless renders WebGL on the CPU and its timings are meaningless.
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const [target, list, out, ...rest] = process.argv.slice(2);
if (!target || !list || !out) { console.error('usage: node stills.mjs <file-or-url> <t1,t2,...> <out-dir> [--selector #stage]'); process.exit(2); }
const si = rest.indexOf('--selector');
const selector = si >= 0 && rest[si + 1] ? rest[si + 1] : '#stage';
const url = /^[a-z]+:\/\//i.test(target) ? target : pathToFileURL(resolve(target)).href;

// Resolve playwright from the current project first, then globally installed copies.
async function chromium() {
  const req = createRequire(resolve(process.cwd(), 'noop.js'));
  for (const pkg of ['playwright', 'playwright-core']) {
    for (const spec of [() => pathToFileURL(req.resolve(pkg)).href, () => pkg]) {
      try { const m = await import(spec()); const c = m.chromium ?? m.default?.chromium; if (c) return c; } catch {}
    }
  }
  throw new Error('needs playwright or playwright-core installed in this project or globally');
}

mkdirSync(out, { recursive: true });
const browser = await (await chromium()).launch({
  headless: false,
  channel: 'chrome',
  args: ['--window-position=-2400,-2400', '--mute-audio', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
}).catch(async () => (await chromium()).launch({ headless: false, args: ['--window-position=-2400,-2400', '--mute-audio'] }));
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e)));
await page.goto(url);
await page.waitForTimeout(1500);
const ms = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => (++n < 90 ? requestAnimationFrame(f) : r((performance.now() - t0) / n)); requestAnimationFrame(f); }));
console.log(`ms/frame while playing: ${ms.toFixed(1)}`);
if (!(await page.evaluate(() => !!window.__anim))) { console.error('page does not expose window.__anim'); await browser.close(); process.exit(1); }
await page.evaluate(() => window.__anim.pause());
for (const t of list.split(',').map(Number)) {
  await page.evaluate(x => window.__anim.seek(x), t);
  await page.waitForTimeout(700);
  const file = resolve(out, `t${t.toFixed(3).padStart(8, '0')}.png`); // ms precision: loop checks compare CYCLE - 1/fps
  await page.locator(selector).screenshot({ path: file });
  console.log('wrote', file);
}
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
if (!existsSync(out)) process.exit(1);
