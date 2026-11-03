/* ui-quality probe: measure a rendered page instead of ticking a checklist.

   Runs axe-core for the rules it already measures well (contrast on solid
   backgrounds, names, roles, target size) and adds the checks axe leaves to a
   human: contrast over images and gradients, focus visibility and focus hidden
   under sticky UI, clickable elements Tab cannot reach, reflow at 320 and 640
   CSS px, text spacing, text-only enlargement, reduced motion, layout shift
   during load, dark mode contrast, and at phone width touch targets, hover
   rules a tap leaves stuck, inputs iOS zooms into and the browser's tap
   flash. It also checks that the page loaded whole: requests that failed,
   uncaught script errors, broken images, the h1's font, videos that fail,
   stall or lack muted or playsinline, and a white first paint under a page
   whose own background is not white. What axe could
   not decide is listed, not
   dropped. axe runs inside every iframe; the probe's own checks of names,
   focus, contrast and targets also reach open shadow roots and same-origin
   iframes.

   Headed Chrome only (headless renders through the CPU and hides GPU-only
   bugs), offscreen and muted, through the repo's launchPlacedChrome() when it
   exists.

   Needs axe-core and playwright-core (or playwright). Install them for the run
   into a scratch folder the probe looks in first, nothing saved to the project:
     npm i --no-save --prefix .tmp/ui-quality-deps axe-core@latest playwright-core@latest

   Usage:
     node <skill>/scripts/probe.mjs --url <url> [--url <url> ...] [--out <dir>]
       [--storage-state <playwright-state.json>] [--wait-for <css>] [--settle <ms>]
       [--max-tabs <n>] [--skip <check,check>] [--strict] [--allow-error-status]

   Writes <out>/report.json, <out>/report.md and screenshots. Exit 0 when every
   URL was audited, 1 with --strict when any finding is a fail, 2 when the probe
   could not run, a URL could not be audited (including an HTTP 4xx or 5xx
   answer), or a check errored. */
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Run from the audited repository root. This also works when the skill is a
// scratch copy or a personal install rather than four levels below it.
const REPO = existsSync(join(process.cwd(), '.git')) ? process.cwd() : resolve(HERE, '../../../..');
const CHECKS = ['axe', 'contrast', 'focus', 'reflow', 'spacing', 'textscale', 'motion', 'shift', 'dark', 'phone', 'page'];

function parseArgs(argv) {
  const opts = { urls: [], out: null, storageState: null, waitFor: null, settle: 1500, maxTabs: 80, skip: new Set(), strict: false, allowErrorStatus: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--url') opts.urls.push(next());
    else if (a === '--out') opts.out = next();
    else if (a === '--storage-state') opts.storageState = next();
    else if (a === '--wait-for') opts.waitFor = next();
    else if (a === '--settle') opts.settle = Number(next());
    else if (a === '--max-tabs') opts.maxTabs = Number(next());
    else if (a === '--skip') next().split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => opts.skip.add(s));
    else if (a === '--strict') opts.strict = true;
    else if (a === '--allow-error-status') opts.allowErrorStatus = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!opts.urls.length) throw new Error('at least one --url is required');
  for (const s of opts.skip) if (!CHECKS.includes(s)) throw new Error(`unknown check ${s}; checks: ${CHECKS.join(', ')}`);
  if (!Number.isFinite(opts.settle) || opts.settle < 0) throw new Error('--settle must be a number of ms');
  if (!Number.isInteger(opts.maxTabs) || opts.maxTabs < 1) throw new Error('--max-tabs must be a positive integer');
  if (opts.storageState && !existsSync(opts.storageState)) throw new Error(`storage state not found: ${opts.storageState}`);
  opts.out = resolve(opts.out || join('.tmp', 'ui-quality', new Date().toISOString().replace(/[:.]/g, '-')));
  return opts;
}

// where the per-run install goes: a scratch folder, so the project's own node_modules and lockfile stay untouched
const DEPS = join(REPO, '.tmp', 'ui-quality-deps');
const INSTALL = `npm i --no-save --prefix "${DEPS}" axe-core@latest playwright-core@latest`;

// resolve a package from the scratch install (under the current folder or the repo root), then the current folder, then the repo root
function resolvePkg(spec) {
  for (const base of [join(process.cwd(), '.tmp', 'ui-quality-deps'), DEPS, process.cwd(), REPO]) {
    try {
      return createRequire(join(base, 'package.json')).resolve(spec);
    } catch { /* try the next base */ }
  }
  return null;
}

let launchedVia = '';
async function launch() {
  // always offscreen: nothing here needs watching, and another placement would cover the operator's screen
  const place = 'offscreen';
  const launcher = join(REPO, 'scripts', 'lib', 'launch-chrome.mjs');
  if (existsSync(launcher)) {
    try {
      const { launchPlacedChrome } = await import(pathToFileURL(launcher).href);
      launchedVia = 'launchPlacedChrome()';
      return await launchPlacedChrome({ place, purpose: 'ui-quality probe' });
    } catch (err) {
      console.warn(`[probe] launchPlacedChrome unavailable (${err.message}); launching directly`);
    }
  }
  const entry = resolvePkg('playwright-core') || resolvePkg('playwright');
  if (!entry) throw new Error(`playwright-core not found; run: ${INSTALL}`);
  // a CommonJS package imported by path exposes its exports on default
  const mod = await import(pathToFileURL(entry).href);
  const chromium = mod.chromium ?? mod.default?.chromium;
  const args = ['--window-position=-2400,-2400', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
  try {
    launchedVia = 'installed Chrome';
    return await chromium.launch({ headless: false, channel: 'chrome', args });
  } catch {
    // no installed Chrome: bundled Chromium, still headed; the report says so
    launchedVia = 'bundled Chromium (no installed Chrome found)';
    return await chromium.launch({ headless: false, args });
  }
}

/* ---------- code that runs inside the page ---------- */

// installed before page scripts on every load: selector helper and layout-shift recorder.
// Elements in open shadow roots and same-origin iframes are reached from the top page;
// their selectors read "host >> inner" (inside a shadow root) and "iframe >>> inner" (inside a frame).
const INIT = () => {
  // the frame element holding a document, when the parent page may be read
  const frameOf = (doc) => { try { return doc.defaultView?.frameElement || null; } catch { return null; } };
  // shortest path from the element upward that matches only this element, within its own document or shadow root
  const sel = (el) => {
    if (!el || el.nodeType !== 1) return '';
    const root = el.getRootNode();
    const unique = (s) => { try { return root.querySelectorAll(s).length === 1; } catch { return false; } };
    const parts = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.id && unique(`#${CSS.escape(n.id)}`)) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      let part = n.localName;
      // parentNode, not parentElement: an element directly inside a shadow root still has siblings there
      const sibs = n.parentNode ? [...n.parentNode.children].filter((c) => c.localName === n.localName) : [];
      if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      parts.unshift(part);
      if (n.localName === 'body' || unique(parts.join(' > '))) break;
    }
    const own = parts.join(' > ');
    if (root.host) return `${sel(root.host)} >> ${own}`;
    const frame = frameOf(el.ownerDocument);
    return frame ? `${sel(frame)} >>> ${own}` : own;
  };
  // the element a selector from sel() or an axe target names; null when it is gone or inside a cross-origin frame
  const find = (path) => {
    let el = null;
    for (const level of path.split(' >>> ')) {
      let scope;
      try { scope = el ? el.contentDocument : document; } catch { return null; }
      for (const part of level.split(' >> ')) {
        if (!scope) return null;
        try { el = scope.querySelector(part); } catch { return null; }
        if (!el) return null;
        scope = el.shadowRoot;
      }
    }
    return el;
  };
  // the next box up: parent element, shadow host, or the iframe holding this document
  const up = (el) => el.parentElement || el.getRootNode().host || frameOf(el.ownerDocument);
  const style = (el) => el.ownerDocument.defaultView.getComputedStyle(el);
  // the page, every open shadow root and every same-origin frame document under it
  const roots = (root = document) => {
    const out = [root];
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) out.push(...roots(el.shadowRoot));
      if (el.localName === 'iframe' || el.localName === 'frame') {
        let doc = null;
        try { doc = el.contentDocument; } catch { /* cross-origin */ }
        if (doc?.body) out.push(...roots(doc));
      }
    }
    return out;
  };
  const all = (selector) => roots().flatMap((r) => [...(r.body || r).querySelectorAll(selector)]);
  // the focused element itself: not the shadow host or iframe that document.activeElement reports
  const deepActive = () => {
    let el = document.activeElement;
    for (;;) {
      if (el?.shadowRoot?.activeElement) { el = el.shadowRoot.activeElement; continue; }
      if (el?.localName === 'iframe' || el?.localName === 'frame') {
        let doc = null;
        try { doc = el.contentDocument; } catch { /* cross-origin */ }
        if (doc?.activeElement && doc.activeElement !== doc.body) { el = doc.activeElement; continue; }
      }
      return el;
    }
  };
  // where a frame's viewport starts in its parent's viewport, and how much a CSS transform scales it there
  const frameBox = (f) => {
    const b = f.getBoundingClientRect(), cs = style(f);
    const sx = f.offsetWidth ? b.width / f.offsetWidth : 1, sy = f.offsetHeight ? b.height / f.offsetHeight : 1;
    return { x: b.left + (f.clientLeft + parseFloat(cs.paddingLeft)) * sx, y: b.top + (f.clientTop + parseFloat(cs.paddingTop)) * sy, sx, sy };
  };
  // an element's box in the top page's viewport, and whether every frame around it shows some of it
  const topRect = (el) => {
    const r = el.getBoundingClientRect();
    let x = r.left, y = r.top, w = r.width, h = r.height, framed = true;
    for (let win = el.ownerDocument.defaultView, f = frameOf(el.ownerDocument); f; win = win.parent, f = frameOf(win.document)) {
      if (x + w <= 0 || y + h <= 0 || x >= win.innerWidth || y >= win.innerHeight) framed = false;
      const fb = frameBox(f);
      x = fb.x + x * fb.sx; y = fb.y + y * fb.sy; w *= fb.sx; h *= fb.sy;
    }
    return { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, framed };
  };
  // whether every frame around an element shows it: a frame hidden with visibility:hidden still lays out its document
  const framesShow = (el) => {
    for (let f = frameOf(el.ownerDocument); f; f = frameOf(f.ownerDocument)) if (!(f.checkVisibility?.({ visibilityProperty: true }) ?? f.getClientRects().length > 0)) return false;
    return true;
  };
  // the element painted at a point of the top page, looking inside open shadow roots and same-origin frames
  const deepPoint = (x, y) => {
    let el = document.elementFromPoint(x, y);
    for (;;) {
      const inner = el?.shadowRoot?.elementFromPoint(x, y);
      if (inner && inner !== el) { el = inner; continue; }
      if (el?.localName === 'iframe' || el?.localName === 'frame') {
        let doc = null;
        try { doc = el.contentDocument; } catch { /* cross-origin */ }
        if (doc) {
          const fb = frameBox(el);
          x = (x - fb.x) / fb.sx; y = (y - fb.y) / fb.sy;
          const hit = doc.elementFromPoint(x, y);
          if (hit) { el = hit; continue; }
        }
      }
      return el;
    }
  };
  const ownText = (el) => [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').replace(/\s+/g, ' ').trim();
  // screen-reader-only text and text pushed out of an icon button are hidden on purpose
  const hiddenOnPurpose = (el) => {
    const cs = style(el);
    const b = el.getBoundingClientRect();
    return b.width <= 2 || b.height <= 2 || cs.clip !== 'auto' || /inset\(50%/.test(cs.clipPath) || Math.abs(parseFloat(cs.textIndent)) > 999;
  };
  // client rects of the visible text inside an element, its own text first
  const textRects = (el, own = false) => {
    const range = el.ownerDocument.createRange();
    const rects = [];
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(), i = 0; n && i < 300; n = walker.nextNode(), i++) {
      if (!n.textContent.trim() || (own && n.parentElement !== el) || hiddenOnPurpose(n.parentElement)) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width && r.height) rects.push({ r, text: n.textContent.trim() });
    }
    return rects;
  };
  // a box that hides its overflow while some of the text inside it lies outside the box
  const clipped = () => {
    const out = [];
    const hides = (v) => v === 'hidden' || v === 'clip';
    for (const el of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const overX = hides(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      const overY = (hides(cs.overflowY) || cs.webkitLineClamp !== 'none') && el.scrollHeight > el.clientHeight + 1;
      if ((!overX && !overY) || hiddenOnPurpose(el)) continue;
      const b = el.getBoundingClientRect();
      for (const { r, text } of textRects(el)) {
        const x = overX && (r.right > b.right + 1 || r.left < b.left - 1);
        const y = overY && (r.bottom > b.bottom + 1 || r.top < b.top - 1);
        if (x || y) { out.push({ selector: sel(el), text: text.slice(0, 60), axis: x && y ? 'both' : x ? 'x' : 'y', hidden: Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight) }); break; }
      }
    }
    return out;
  };
  window.__uq = { sel, find, up, style, roots, all, deepActive, topRect, framesShow, deepPoint, ownText, textRects, clipped, shifts: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__uq.shifts.push({ t: e.startTime, value: e.value, sources: (e.sources || []).map((s) => window.__uq.sel(s.node)).filter(Boolean) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* layout-shift not supported */ }
};

// pixel work happens on a blank page so the audited page's CSP and scripts cannot interfere
const PIXELS = async ({ op, a, a2, b, b2, rect, rects, color, threshold }) => {
  const load = async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return ctx;
  };
  const crop = (ctx, box = rect) => {
    const x = Math.max(0, Math.floor(box.x)), y = Math.max(0, Math.floor(box.y));
    const w = Math.min(ctx.canvas.width - x, Math.ceil(box.width)), h = Math.min(ctx.canvas.height - y, Math.ceil(box.height));
    if (w <= 0 || h <= 0) return null;
    return ctx.getImageData(x, y, w, h).data;
  };
  if (op === 'diff') {
    const ca = await load(a);
    const da = crop(ca), db = crop(await load(b));
    if (!da || !db) return { changed: 0, total: 0, moving: 0 };
    const differ = (x, y, i) => Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > threshold;
    const n = da.length / 4;
    // optional a2 and b2: second shots of a's and b's states. Pixels that differ within either pair change on their
    // own; they and the 2 px around them (where the motion may have been between the shots) are left out
    const still = new Uint8Array(n).fill(1);
    const pairs = [[da, a2], [db, b2]].filter(([, s]) => s);
    if (pairs.length) {
      // the crop's width, as crop() computed it
      const w = Math.min(ca.canvas.width - Math.max(0, Math.floor(rect.x)), Math.ceil(rect.width));
      const motion = new Uint8Array(n);
      for (const [x, s] of pairs) {
        const y = crop(await load(s));
        if (y) for (let i = 0; i < n; i++) if (differ(x, y, i * 4)) motion[i] = 1;
      }
      for (let i = 0; i < n; i++) {
        if (!motion[i]) continue;
        const px = i % w, py = Math.floor(i / w);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const qx = px + dx, qy = py + dy, q = qy * w + qx;
          if (qx >= 0 && qx < w && q >= 0 && q < n) still[q] = 0;
        }
      }
    }
    let changed = 0, moving = 0;
    for (let i = 0; i < n; i++) {
      if (!still[i]) moving++;
      else if (differ(da, db, i * 4)) changed++;
    }
    return { changed, total: n, moving };
  }
  if (op === 'light') {
    // share of the shot that is near-white: every channel 235 or more
    const ctx = await load(a);
    const d = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
    let light = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] >= 235 && d[i + 1] >= 235 && d[i + 2] >= 235) light++;
    return d.length ? light / (d.length / 4) : 0;
  }
  // op === 'contrast': text colour (with alpha) against every background pixel under the text's own line boxes.
  // Optional b: the same view with the text's faded boxes at full opacity. With their opacities multiplied into
  // color.a, a text pixel is the a pixel plus color.a times (text colour minus the b pixel); without b that is
  // plain alpha blending over a
  const ctx = await load(a), under = b ? await load(b) : null;
  const parts = rects.map((box) => [crop(ctx, box), under && crop(under, box)]).filter(([p, q]) => p && (!under || q));
  if (!parts.length) return null;
  const join = (list) => (list.length === 1 ? list[0] : list.reduce((acc, p) => { const out = new Uint8ClampedArray(acc.length + p.length); out.set(acc); out.set(p, acc.length); return out; }));
  const d = join(parts.map(([p]) => p)), e = under ? join(parts.map(([, q]) => q)) : d;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const clamp = (v) => Math.min(255, Math.max(0, v));
  const ratios = [];
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, bl] = [d[i], d[i + 1], d[i + 2]];
    const fr = clamp(r + color.a * (color.r - e[i])), fg = clamp(g + color.a * (color.g - e[i + 1])), fb = clamp(bl + color.a * (color.b - e[i + 2]));
    const l1 = lum(fr, fg, fb), l2 = lum(r, g, bl);
    ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
  }
  ratios.sort((x, y) => x - y);
  const at = (p) => ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))];
  return { p05: at(0.05), median: at(0.5), worst: ratios[0], pixels: ratios.length };
};

/* ---------- runner ---------- */

const opts = (() => {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[probe] ${err.message}`);
    process.exit(2);
  }
})();

// a crash anywhere is an incomplete run (exit 2), never confused with --strict's exit 1
let browser;
const crash = async (err) => {
  console.error(`[probe] crashed: ${err?.stack || err}`);
  try { await browser?.close(); } catch { /* already gone */ }
  process.exit(2);
};
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

const axePath = resolvePkg('axe-core/axe.min.js');
if (!axePath && !opts.skip.has('axe')) {
  console.error(`[probe] axe-core not found; run: ${INSTALL}`);
  process.exit(2);
}
let axeSource = null;
try {
  axeSource = axePath ? readFileSync(axePath, 'utf8') : null;
  mkdirSync(opts.out, { recursive: true });
} catch (err) {
  console.error(`[probe] could not start: ${err.message}`);
  process.exit(2);
}

const findings = [];
const notes = [];
const axeReview = new Map();
const shots = [];
const add = (f) => {
  // the same problem seen at several viewports is one finding
  const observation = { viewport: f.viewport, measured: f.measured, ...(f.threshold ? { threshold: f.threshold } : {}) };
  const same = findings.find((g) => g.check === f.check && g.url === f.url && g.selector === f.selector);
  if (same) {
    if (!same.viewport.split(', ').includes(f.viewport)) same.viewport += `, ${f.viewport}`;
    same.observations.push(observation);
    return;
  }
  findings.push({ ...f, observations: [observation] });
};
const on = (check) => !opts.skip.has(check);
// an axe target has one entry per frame level, each a selector or a list of selectors through shadow roots;
// written the way sel() writes them, so __uq.find() resolves both
const fmtTarget = (target) => target.map((t) => (Array.isArray(t) ? t.join(' >> ') : t)).join(' >>> ');
// the same page apart from an in-page anchor after #; a hash route (#/settings, #!/settings) names a different screen.
// Plain anchors are ignored because scroll-spy scripts rewrite them while Tab scrolls the page
const samePage = (a, b) => {
  const page = (u) => { const [base, hash = ''] = u.split(/#(.*)/s); return /^[/!]/.test(hash) ? `${base}#${hash}` : base; };
  return page(a) === page(b);
};
// numbered by position, so state URLs that share a long prefix never overwrite each other's screenshots
const slug = (url) => `${String(opts.urls.indexOf(url) + 1).padStart(2, '0')}-${url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'page'}`;

try {
  browser = await launch();
} catch (err) {
  console.error(`[probe] could not launch Chrome: ${err.message.split('\n')[0]}`);
  process.exit(2);
}
const browserInfo = `${launchedVia}, version ${browser.version()}`;
if (launchedVia.startsWith('bundled')) notes.push(`ran in ${browserInfo}, not the installed Chrome; GPU and font rendering may differ`);
const blank = await (await browser.newContext()).newPage();
const pixels = (args) => blank.evaluate(PIXELS, args);

// hooks.before(page) runs before the page loads, to attach listeners; hooks.paint(page) runs about every
// 100 ms from the first response until the settle time ends, to see the page while it first paints
async function open(url, ctxOpts = {}, hooks = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    bypassCSP: true,
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
    ...ctxOpts,
  });
  // the caller closes the context only once it has it; a failure here closes it before rethrowing
  try {
    await context.addInitScript(INIT);
    const page = await context.newPage();
    await hooks.before?.(page);
    const response = await page.goto(url, { waitUntil: hooks.paint ? 'commit' : 'load', timeout: 60000 });
    // a 404 or 500 page, or a sign-in page served with an error code, is not the page that was asked for
    if (response && response.status() >= 400 && !opts.allowErrorStatus) {
      throw new Error(`HTTP ${response.status()}: not audited (pass --allow-error-status to audit an error page on purpose)`);
    }
    // call hooks.paint until `until` settles; a rejection (a load timeout) ends the run like any other failure
    const sample = async (until) => {
      let done = false;
      until.then(() => { done = true; }, () => { /* raced below */ });
      while (!done) {
        await hooks.paint(page);
        await Promise.race([until, page.waitForTimeout(100)]);
      }
      await until;
    };
    if (hooks.paint) await sample(page.waitForLoadState('load', { timeout: 60000 }));
    // frames keep coming while --wait-for waits, so a flash while an app renders is seen
    if (opts.waitFor) {
      const ready = page.waitForSelector(opts.waitFor, { timeout: 30000 });
      if (hooks.paint) await sample(ready);
      else await ready;
    }
    if (hooks.paint) await sample(page.waitForTimeout(opts.settle));
    else await page.waitForTimeout(opts.settle);
    return { context, page };
  } catch (err) {
    await context.close().catch(() => { /* already gone */ });
    throw err;
  }
}

async function shot(page, name, full = true) {
  const file = join(opts.out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  shots.push(file);
  return file;
}

// axe tests inside an iframe only when its own copy runs there; Playwright reaches cross-origin frames too,
// and each copy must accept messages from other origins or axe skips cross-origin frames
const axeReady = () => window.axe.configure({ allowedOrigins: ['<unsafe_all_origins>'] });
async function injectAxe(page, url) {
  await page.evaluate(axeSource);
  await page.evaluate(axeReady);
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      await frame.evaluate(axeSource);
      await frame.evaluate(axeReady);
    } catch (err) {
      const note = `${url}: axe could not run inside frame ${frame.url().slice(0, 80) || '(no address)'} (${err.message.split('\n')[0]}); its content was not checked`;
      if (!notes.includes(note)) notes.push(note);
    }
  }
}

async function runAxe(page, url, viewport, tags) {
  await injectAxe(page, url);
  const res = await page.evaluate((values) => window.axe.run(document, {
    runOnly: { type: 'tag', values },
    resultTypes: ['violations', 'incomplete'],
  }), tags);
  for (const v of res.violations) {
    const wcag = v.tags.filter((t) => /^wcag\d{3,4}$/.test(t)).map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, '$1.$2.$3'));
    const level = v.tags.includes('best-practice') ? 'best practice' : v.tags.some((t) => /^wcag2\d*aaa$/.test(t)) ? 'AAA' : 'A/AA';
    for (const n of v.nodes.slice(0, 15)) {
      add({
        check: `axe:${v.id}`, url, viewport, wcag, level,
        severity: level === 'A/AA' ? 'fail' : 'advisory',
        selector: fmtTarget(n.target), measured: n.failureSummary?.split('\n').slice(1).join(' ').trim() || v.help,
        help: v.helpUrl,
      });
    }
    if (v.nodes.length > 15) notes.push(`${url} ${viewport}: axe ${v.id} has ${v.nodes.length - 15} more nodes`);
  }
  // Keep every undecided row, including contrast at widths the pixel check does
  // not sample. Desktop contrast also goes on to the pixel check; the report
  // reader reconciles that evidence rather than treating absence as a pass.
  for (const r of res.incomplete) {
    const key = `${url} ${viewport} ${r.id}`;
    if (!axeReview.has(key)) axeReview.set(key, { url, id: r.id, help: r.help, viewports: [], nodes: r.nodes.slice(0, 5).map((n) => fmtTarget(n.target)), count: r.nodes.length });
    axeReview.get(key).viewports.push(viewport);
  }
  return res.incomplete;
}

// the two names axe accepts and a person would not: a placeholder as the only field label, one glyph as a control's name
async function nameGaps(page, url) {
  const gaps = await page.evaluate(() => {
    const out = [];
    const { all, style, framesShow } = window.__uq;
    const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && style(el).visibility !== 'hidden' && framesShow(el); };
    for (const el of all('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea')) {
      const ph = (el.getAttribute('placeholder') || '').trim();
      if (!ph || !shown(el)) continue;
      const labelled = [...(el.labels || [])].some((l) => l.innerText.trim()) || (el.getAttribute('aria-label') || '').trim() || el.hasAttribute('aria-labelledby');
      if (!labelled) out.push({ kind: 'placeholder', selector: window.__uq.sel(el), name: ph });
    }
    for (const el of all('button, a[href], [role=button], [role=link], input[type=submit], input[type=button]')) {
      if (el.hasAttribute('aria-labelledby') || !shown(el)) continue;
      const name = (el.getAttribute('aria-label') || (el.localName === 'input' ? el.value : el.innerText) || '').replace(/\s+/g, ' ').trim();
      // one non-digit character ("x", "×", "+", "»"), or two characters with no letter or digit; page numbers are left alone
      if (/^\P{N}$/u.test(name) || (name.length === 2 && !/[\p{L}\p{N}]/u.test(name))) out.push({ kind: 'glyph', selector: window.__uq.sel(el), name });
    }
    return out;
  });
  for (const g of gaps.filter((x) => x.kind === 'placeholder').slice(0, 15)) {
    add({ check: 'name:placeholder-only', url, viewport: '1280', wcag: ['3.3.2'], level: 'A/AA', severity: 'review', selector: g.selector, measured: `field named only by its placeholder "${g.name}", which disappears once the user types; axe accepts it` });
  }
  for (const g of gaps.filter((x) => x.kind === 'glyph').slice(0, 15)) {
    add({ check: 'name:glyph', url, viewport: '1280', wcag: ['4.1.2'], level: 'A/AA', severity: 'review', selector: g.selector, measured: `control's accessible name is "${g.name}", which does not say what it does; axe accepts it` });
  }
}

async function compositedContrast(page, url, incomplete) {
  const cc = incomplete.find((r) => r.id === 'color-contrast');
  if (!cc) return;
  if (cc.nodes.length > 40) notes.push(`${url}: contrast over images checked the first 40 of ${cc.nodes.length} elements axe could not decide; the rest were not checked`);
  let unreached = 0;
  for (const n of cc.nodes.slice(0, 40)) {
    const selector = fmtTarget(n.target);
    const info = await page.evaluate((s) => {
      const { find, up, style } = window.__uq;
      const el = find(s);
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const cs = style(el);
      // any CSS colour (oklch, color(), rgb) to sRGB through a canvas
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = cs.color;
      ctx.fillRect(0, 0, 1, 1);
      const m = ctx.getImageData(0, 0, 1, 1).data;
      // opacity on the element or any box around it (across shadow roots and frames) fades the text as well
      let opacity = 1;
      for (let x = el; x; x = up(x)) opacity *= parseFloat(style(x).opacity);
      const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
      return { color: { r: m[0], g: m[1], b: m[2], a: (m[3] / 255) * opacity }, opacity, large: size >= 24 || (size >= 18.66 && weight >= 700) };
    }, selector);
    if (!info) { unreached++; continue; }
    // hide the text itself so the screenshot shows only what sits behind it
    await page.evaluate((s) => {
      const el = window.__uq.find(s);
      el.dataset.uqColor = el.style.cssText;
      el.style.setProperty('color', 'transparent', 'important');
      el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
      el.style.setProperty('text-shadow', 'none', 'important');
    }, selector);
    let rects = [], buf = null, flat = null;
    try {
      await page.waitForTimeout(50);
      // sample only where the text sits: its line boxes, not the whole element, moved into the top page's coordinates
      rects = await page.evaluate((s) => {
        const { find, textRects, topRect } = window.__uq;
        const el = find(s);
        const t = topRect(el), b = el.getBoundingClientRect();
        const sx = b.width ? t.width / b.width : 1, sy = b.height ? t.height / b.height : 1;
        const own = textRects(el, true);
        return (own.length ? own : textRects(el)).map(({ r }) => ({ x: t.left + (r.left - b.left) * sx, y: t.top + (r.top - b.top) * sy, width: r.width * sx, height: r.height * sy }));
      }, selector);
      buf = await page.screenshot();
      // a faded box can paint its own background behind the text, already faded in buf; a second shot with every
      // opacity set to 1 shows what the text sits on inside the faded boxes
      if (info.opacity < 1) {
        await page.evaluate((s) => {
          const { find, up, style } = window.__uq;
          window.__uqOpacity = [];
          // transitions off as well, or an opacity transition would still be fading in when the shot is taken
          for (let x = find(s); x; x = up(x)) {
            const faded = parseFloat(style(x).opacity) < 1;
            for (const prop of ['opacity', 'transition', 'isolation']) window.__uqOpacity.push([x, prop, x.style.getPropertyValue(prop), x.style.getPropertyPriority(prop)]);
            x.style.setProperty('transition', 'none', 'important');
            x.style.setProperty('opacity', '1', 'important');
            // opacity made a faded box its own stacking context; keep one, or a z-index:-1 layer inside it would drop
            // behind its background and the shot would show a different backdrop
            if (faded) x.style.setProperty('isolation', 'isolate', 'important');
          }
        }, selector);
        await page.waitForTimeout(50);
        flat = await page.screenshot();
      }
    } finally {
      // put the page back even when a capture fails, so the checks after this one measure it unchanged
      await page.evaluate((s) => {
        for (const [x, prop, value, priority] of window.__uqOpacity || []) value ? x.style.setProperty(prop, value, priority) : x.style.removeProperty(prop);
        delete window.__uqOpacity;
        const el = window.__uq.find(s);
        if (el && 'uqColor' in el.dataset) { el.style.cssText = el.dataset.uqColor; delete el.dataset.uqColor; }
      }, selector);
    }
    if (!rects.length) continue;
    const r = await pixels({ op: 'contrast', a: buf.toString('base64'), b: flat?.toString('base64'), rects, color: info.color });
    if (!r) continue;
    const need = info.large ? 3 : 4.5;
    const severity = r.median < need ? 'fail' : r.p05 < need ? 'review' : 'pass';
    if (severity === 'pass') continue;
    add({
      check: 'contrast:composited', url, viewport: '1280', wcag: ['1.4.3'], level: 'A/AA', severity, selector,
      measured: `median ${r.median.toFixed(2)}:1, worst 5% ${r.p05.toFixed(2)}:1 over ${r.pixels} px${info.opacity < 1 ? `, text faded to ${Math.round(info.opacity * 100)}% by opacity` : ''}`,
      threshold: `${need}:1 (${info.large ? 'large' : 'normal'} text)`,
    });
  }
  if (unreached) notes.push(`${url}: contrast over images could not reach ${unreached} of the elements axe could not decide (inside a cross-origin frame, or gone from the page); they were not checked`);
}

async function focusWalk(page, url) {
  // measure settled markers: a ring still fading, or a smooth scroll still moving the page, would read as pixels
  // that change on their own. Animations keep running; the comparison below leaves their pixels out instead.
  await page.evaluate(() => {
    for (const r of window.__uq.roots()) {
      const s = (r.ownerDocument || r).createElement('style');
      s.className = '__uq-still';
      s.textContent = '*,*::before,*::after{transition:none!important;scroll-behavior:auto!important}';
      (r.head || r).appendChild(s);
    }
    window.scrollTo(0, 0);
    document.activeElement?.blur?.();
    // start Tab from the top of the page, or of an open modal dialog: blurring an autofocused control would start it
    // there instead, and the controls before it would read as never reached
    let modal = null;
    for (const r of window.__uq.roots(document)) if (r === document || r.host) modal ||= r.querySelector('dialog:modal');
    const mark = document.createElement('span');
    mark.id = '__uq-start';
    mark.tabIndex = -1;
    mark.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden';
    (modal || document.body).prepend(mark);
    mark.focus({ preventScroll: true });
  });
  // focus that loads another page is a change of context (WCAG 3.2.1), and every later check would measure the wrong page
  const start = page.url();
  let navigatedTo = null;
  const onNav = (frame) => { if (frame === page.mainFrame() && !samePage(frame.url(), start)) navigatedTo = frame.url(); };
  page.on('framenavigated', onNav);
  const order = [];
  // why the walk stopped: 'end' (focus left the page), 'cycle', 'loop', 'navigated', or the --max-tabs limit
  let ended = 'max-tabs';
  let last = null;
  let pressed = false;
  // elements hidden for the screenshots, to show again if a measurement throws
  let uncover = null;
  try {
    for (let i = 0; i < opts.maxTabs; i++) {
      // after leaving a cross-origin frame, focus already sits on the next stop
      if (!pressed) await page.keyboard.press('Tab');
      pressed = false;
      await page.waitForTimeout(180);
      // focus has left the start marker; take it out before measuring, or selectors such as :first-child would stop matching
      if (i === 0 && !navigatedTo) await page.evaluate(() => { for (const r of window.__uq.roots()) r.querySelector('#__uq-start')?.remove(); }).catch(() => {});
      const f = navigatedTo ? null : await page.evaluate(() => {
        const { deepActive, sel, topRect, up, style, deepPoint } = window.__uq;
        const el = deepActive();
        if (!el || el === document.body || el === document.documentElement) return null;
        if (el.localName === 'iframe' || el.localName === 'frame') {
          let doc = null;
          try { doc = el.contentDocument; } catch { /* cross-origin */ }
          // a same-origin frame with nothing focused inside it yet: the next Tab moves in
          if (doc) return { frameIdle: true };
          window.__uqFrame = el;
          return { selector: sel(el), crossFrame: true };
        }
        // element identity, not selector text, decides whether focus came back around
        // via: the shadow hosts and frames around each reached element; a host that delegates focus is reached through them
        const st = (window.__uqFocus ||= { seen: new WeakSet(), via: new WeakSet(), first: null });
        for (let x = up(el); x; x = up(x)) st.via.add(x);
        if (st.seen.has(el)) return { selector: sel(el), repeat: el === st.first ? 'first' : 'other' };
        st.seen.add(el);
        st.first ??= el;
        const r = topRect(el);
        const vw = innerWidth, vh = innerHeight;
        const inView = r.width > 0 && r.height > 0 && r.framed && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
        const hiddenInput = el.localName === 'input' && (r.width <= 1 || r.height <= 1) && (['checkbox', 'radio'].includes(el.type) || el.labels?.length > 0);        // sample the focused box: is something fixed or sticky painted on top of it?
        const pts = [[0.5, 0.5], [0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]
          .map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy])
          .filter(([x, y]) => x >= 0 && y >= 0 && x < vw && y < vh);
        // a is b or inside it, across shadow roots and frames
        const inside = (a, b) => { for (let x = a; x; x = up(x)) if (x === b) return true; return false; };
        let covered = 0;
        const coverers = new Set();
        for (const [x, y] of pts) {
          // the deepest element painted there, so an overlay inside the element's own frame or component counts
          const top = deepPoint(x, y);
          if (!top || inside(top, el) || inside(el, top)) continue;
          let n = top, pinned = false;
          // climb out of frames too (a fixed chat iframe is an overlay), but not into a box that holds the element
          for (; n && !(n.localName === 'body' && n.ownerDocument === document) && !inside(el, n); n = up(n)) {
            const p = style(n).position;
            if (p === 'fixed' || p === 'sticky') { pinned = true; break; }
          }
          if (pinned) { covered++; coverers.add(sel(n)); }
        }
        // never read what was typed into a field: a password or saved personal data would end up in the report
        const typed = el.localName === 'textarea' || (el.localName === 'input' && !['button', 'submit', 'reset'].includes(el.type));
        const labels = [...(el.labels || [])].map((l) => l.innerText).join(' ');
        return {
          selector: sel(el), name: (el.getAttribute('aria-label') || labels || (typed ? '' : el.innerText || el.value) || el.title || '').trim().slice(0, 40),
          rect: { x: r.left - 8, y: r.top - 8, width: r.width + 16, height: r.height + 16 }, perimeter: 2 * (r.width + r.height),
          inView, hiddenInput, points: pts.length, covered, coverers: [...coverers], coveredBy: [...coverers].join(', '),
        };
      }).catch(async (err) => {
        // a page that navigates destroys the context mid-call; wait for the navigation event before calling it an error
        await page.waitForTimeout(500);
        if (navigatedTo) return null;
        throw err;
      });
      if (navigatedTo) {
        add({ check: 'focus:navigated', url, viewport: '1280', wcag: ['3.2.1'], level: 'A/AA', severity: 'review', selector: last || 'document', measured: `pressing Tab${last ? ` from ${last}` : ''} loaded ${navigatedTo}; moving focus alone must not change the page (rule out a timer or load-time redirect)` });
        notes.push(`${url}: focus walk stopped after ${order.length} stops because the page navigated; later checks reopened the page`);
        ended = 'navigated';
        break;
      }
      if (!f) { if (i > 0) { ended = 'end'; break; } continue; }
      if (f.frameIdle) continue;
      if (f.crossFrame) {
        // Tab on through the frame's own controls until focus is back outside it; those controls are not measured
        let stops = 1;
        for (; stops <= opts.maxTabs; stops++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(60);
          if (!(await page.evaluate(() => window.__uq.deepActive() === window.__uqFrame))) break;
        }
        order.push(`${f.selector} (cross-origin frame, ${stops} Tab stops inside, not measured)`);
        notes.push(`${url}: focus markers inside cross-origin frame ${f.selector} were not measured`);
        if (stops > opts.maxTabs) { notes.push(`${url}: focus stayed inside frame ${f.selector} for --max-tabs presses; walk stopped there`); ended = 'loop'; break; }
        // the press that left the frame already moved focus to the next stop
        pressed = true;
        last = f.selector;
        continue;
      }
      if (f.repeat === 'first') { ended = 'cycle'; break; }
      if (f.repeat) { notes.push(`${url}: focus returned to ${f.selector} before reaching the end; possible trap or loop`); ended = 'loop'; break; }
      last = f.selector;
      order.push(f.name ? `${f.selector} "${f.name}"` : f.selector);
      if (!f.inView || f.hiddenInput) {
        // a visually hidden native input behind a custom control usually draws its ring on the label; a person has to look
        if (f.hiddenInput) add({ check: 'focus:hidden-input', url, viewport: '1280', wcag: ['2.4.7'], level: 'A/AA', severity: 'review', selector: f.selector, measured: 'focus is on a 0 or 1 px native input; check that its label or custom control shows a focus marker' });
        else add({ check: 'focus:offscreen', url, viewport: '1280', wcag: ['2.4.7'], level: 'A/AA', severity: 'fail', selector: f.selector, measured: 'focused element is outside the viewport or has no size' });
        continue;
      }
      let hidden = [];
      if (f.points && f.covered === f.points) {
        add({ check: 'focus:obscured', url, viewport: '1280', wcag: ['2.4.11'], level: 'A/AA', severity: 'fail', selector: f.selector, measured: `entirely covered by ${f.coveredBy}` });
        // still measure the ring itself: hide what covers it for the screenshots
        hidden = f.coverers;
      } else if (f.covered) {
        add({ check: 'focus:partly-obscured', url, viewport: '1280', wcag: ['2.4.12'], level: 'AAA', severity: 'advisory', selector: f.selector, measured: `${f.covered}/${f.points} sample points covered by ${f.coveredBy}` });
      }
      const cover = (on) => page.evaluate(([sels, hide]) => {
        for (const s of sels) { const n = window.__uq.find(s); if (n) n.style.visibility = hide ? 'hidden' : ''; }
      }, [hidden, on]);
      if (hidden.length) { await cover(true); uncover = () => cover(false); await page.waitForTimeout(50); }
      // focused vs unfocused pixels around the element; a second shot of each state shows what changes there on its own.
      // Then put focus back for the next Tab
      const on1 = await page.screenshot();
      await page.waitForTimeout(180);
      const on2 = await page.screenshot();
      await page.evaluate(() => { window.__uqLast = window.__uq.deepActive(); window.__uqLast.blur(); });
      await page.waitForTimeout(180);
      const off = await page.screenshot();
      await page.waitForTimeout(180);
      const off2 = await page.screenshot();
      await page.evaluate(() => window.__uqLast.focus({ preventScroll: true }));
      if (uncover) { await uncover(); uncover = null; }
      const b64 = (buf) => buf.toString('base64');
      const d = await pixels({ op: 'diff', a: b64(on1), a2: b64(on2), b: b64(off), b2: b64(off2), rect: f.rect, threshold: 48 });
      const how = `${hidden.length ? ` (measured with ${f.coveredBy} hidden)` : ''}${d.moving ? ` (${d.moving} px that change on their own left out)` : ''}`;
      if (d.moving > d.total * 0.1) {
        // an animation or video behind the element: the comparison cannot tell a marker from motion
        add({ check: 'focus:unmeasured', url, viewport: '1280', wcag: ['2.4.7'], level: 'A/AA', severity: 'review', selector: f.selector, measured: `${d.moving} of ${d.total} px around it change with no change of focus, so the marker could not be measured; Tab to it and look` });
      } else if (d.changed === 0) {
        add({ check: 'focus:invisible', url, viewport: '1280', wcag: ['2.4.7'], level: 'A/AA', severity: 'fail', selector: f.selector, measured: `no pixel changes between focused and unfocused${how}` });
      } else if (d.changed < f.perimeter) {
        // a craft heuristic, not the 2.4.13 area-and-contrast test
        add({ check: 'focus:weak', url, viewport: '1280', wcag: [], level: 'craft', severity: 'review', selector: f.selector, measured: `${d.changed} px changed, less than a 1 px ring around it (${Math.round(f.perimeter)} px)${how}` });
      }
    }
  } finally {
    page.off('framenavigated', onNav);
    // the checks after this one reopen a page that navigated, so its measuring style needs no clean-up.
    // On any other exit, an error included, reflow measures this page next and needs it as it was
    if (!navigatedTo) {
      if (uncover) await uncover().catch(() => {});
      await page.evaluate(() => { for (const r of window.__uq.roots()) for (const s of r.querySelectorAll('style.__uq-still, #__uq-start')) s.remove(); }).catch(() => {});
    }
  }
  if (ended === 'navigated') return { order, navigated: true };
  if (ended === 'max-tabs') notes.push(`${url}: focus walk stopped at --max-tabs ${opts.maxTabs}; later controls were not checked`);

  // focusable elements the walk never reached: behind a trap, after a loop, or out of the Tab order by script
  const missed = ended === 'max-tabs' || !order.length ? [] : await page.evaluate(() => {
    const { all, sel, up, roots } = window.__uq;
    const seen = window.__uqFocus?.seen || new WeakSet(), via = window.__uqFocus?.via || new WeakSet();
    // an open modal dialog, in the page, a shadow root or a frame, makes the rest of its document inert
    const modals = new Map();
    for (const r of roots()) for (const d of r.querySelectorAll('dialog:modal')) if (!modals.has(d.ownerDocument)) modals.set(d.ownerDocument, d);
    // visible and not inert, in its own document and in every frame around it
    const shown = (el) => {
      if (!(el.checkVisibility?.({ visibilityProperty: true }) ?? el.getClientRects().length > 0)) return false;
      const chain = [];
      for (let x = el; x; x = up(x)) {
        if (x.hasAttribute('inert')) return false;
        // the frame around a frame's document must show it too
        if (x.localName === 'iframe' || x.localName === 'frame') if (!(x.checkVisibility?.({ visibilityProperty: true }) ?? x.getClientRects().length > 0)) return false;
        chain.push(x);
      }
      // outside its document's open modal dialog, through shadow hosts as well
      for (const [doc, modal] of modals) if (chain.some((x) => x.ownerDocument === doc) && !chain.includes(modal)) return false;
      return true;
    };
    const groups = new Map();
    const out = [];
    for (const el of all('a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable=""], [contenteditable="true"], [tabindex]')) {
      // a shadow host or frame Tab went into counts as reached: delegatesFocus moves its focus to a control inside
      if (seen.has(el) || (via.has(el) && (el.shadowRoot || el.localName === 'iframe' || el.localName === 'frame')) || el.matches(':disabled') || Number(el.getAttribute('tabindex')) < 0) continue;
      if (el.localName === 'summary' && el.parentElement?.localName !== 'details') continue;
      if (!shown(el)) continue;
      // one radio per group is a Tab stop: report a group only when none of its radios was reached.
      // A group is one name within one form, or within one document or shadow root outside any form
      if (el.type === 'radio' && el.name) {
        const root = el.getRootNode(), owner = el.form || root;
        if (!groups.has(owner)) groups.set(owner, new Set());
        if (groups.get(owner).has(el.name)) continue;
        groups.get(owner).add(el.name);
        if ([...root.querySelectorAll('input[type=radio]')].some((r) => r.name === el.name && r.form === el.form && seen.has(r))) continue;
      }
      out.push(sel(el));
    }
    return out;
  });
  if (missed.length) {
    const why = ended === 'cycle' ? 'focus cycled back to the first stop without reaching them, which is how a focus trap looks'
      : ended === 'loop' ? 'focus came back to an earlier stop, so the walk ended before them'
        : 'focus left the page before reaching them';
    add({ check: 'keyboard:not-reached', url, viewport: '1280', wcag: ['2.1.1', '2.1.2'], level: 'A/AA', severity: 'review', selector: missed.slice(0, 12).join('; '), measured: `${missed.length} visible focusable elements Tab never reached; ${why}` });
  }
  // things styled as clickable that Tab can never reach: a div with a pointer cursor or an inline onclick,
  // or a native link or button taken out of the Tab order with a negative tabindex
  const unreachable = await page.evaluate(() => {
    const { all, style, sel, framesShow } = window.__uq;
    const native = 'a[href], button, input, select, textarea, summary, [contenteditable]';
    // reachable by Tab itself, or a label; tabindex="-1" is not reachable
    const self = `:is(${native}):not([tabindex^="-"]), label, [tabindex]:not([tabindex^="-"])`;
    // only real controls make their descendants part of one target; a focus wrapper such as <main tabindex="-1"> does not
    const wraps = 'a[href], button, summary, [contenteditable]';
    // roving tabindex: a composite widget keeps one item in the Tab order and moves between the rest with arrow keys
    const roving = '[role=toolbar], [role=tablist], [role=menu], [role=menubar], [role=listbox], [role=radiogroup], [role=grid], [role=tree], [role=treegrid]';
    const out = [];
    for (const el of all('*')) {
      const parent = el.parentElement || el.getRootNode().host;
      if (!parent || el.matches(self) || parent.closest(wraps)) continue;
      const nativeOut = el.matches('a[href], button, summary');
      if (nativeOut && (el.disabled || el.closest('[aria-hidden="true"]') || el.closest(roving)?.querySelector('[tabindex="0"]'))) continue;
      const cs = style(el);
      const pointer = cs.cursor === 'pointer' && style(parent).cursor !== 'pointer';
      if (!nativeOut && !pointer && !el.hasAttribute('onclick')) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || cs.visibility === 'hidden' || !framesShow(el)) continue;
      out.push({ selector: `${sel(el)}${el.getAttribute('role') ? ` role=${el.getAttribute('role')}` : ''}`, native: nativeOut });
    }
    return out;
  });
  for (const u of unreachable.slice(0, 15)) {
    const measured = u.native
      ? 'a visible link or button with a negative tabindex; Tab skips it'
      : 'styled as clickable (pointer cursor or onclick) but not a link, button or form control and has no tabindex of 0 or more; Tab cannot reach it';
    add({ check: 'keyboard:unreachable', url, viewport: '1280', wcag: ['2.1.1'], level: 'A/AA', severity: 'review', selector: u.selector, measured });
  }
  if (!order.length) add({ check: 'focus:none', url, viewport: '1280', wcag: ['2.1.1'], level: 'A/AA', severity: 'review', selector: 'document', measured: 'Tab reached no element; confirm the page has controls' });
  return { order, navigated: false };
}

async function reflow(page, url) {
  for (const width of [320, 640]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const se = document.scrollingElement;
      const vw = innerWidth;
      // overflow-x on html, or on body when html leaves it visible, applies to the viewport;
      // hidden or clip there cuts content off even though scrollWidth still counts it
      const ox = (el) => getComputedStyle(el).overflowX;
      const rootOx = ox(document.documentElement) !== 'visible' ? ox(document.documentElement) : ox(document.body);
      const rootClips = rootOx === 'hidden' || rootOx === 'clip';
      // nearest ancestor that fits the viewport and stops overflow: 'scroll' (content scrolls inside it) or 'clip' (content is cut off)
      const container = (el) => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          if (n.getBoundingClientRect().right > vw + 1) continue;
          const o = getComputedStyle(n).overflowX;
          if (o === 'auto' || o === 'scroll') return 'scroll';
          if (o === 'hidden' || o === 'clip') return 'clip';
        }
        return null;
      };
      const over = [], cut = [];
      for (const el of document.body.querySelectorAll('*')) {
        const b = el.getBoundingClientRect();
        if (!b.width || b.right <= vw + 1) continue;
        const c = container(el);
        if (c === 'scroll') continue;
        // closed off-canvas menus and drawers are not lost content
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.opacity === '0' || el.closest('[aria-hidden="true"], [inert]')) continue;
        (c === 'clip' ? cut : over).push(el);
      }
      // keep the outermost offenders only
      const outer = (list) => { const set = new Set(list); return list.filter((el) => !set.has(el.parentElement)).slice(0, 15).map((el) => ({ selector: window.__uq.sel(el), right: Math.round(el.getBoundingClientRect().right) })); };
      return { overflow: rootClips ? 0 : se.scrollWidth - se.clientWidth, offenders: outer(over), cut: outer(cut), clipped: window.__uq.clipped() };
    });
    await shot(page, `${slug(url)}-${width}`);
    // responsive pages show and hide different controls at 320; axe runs there too
    if (width === 320 && on('axe') && axeSource) await runAxe(page, url, '320', ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
    if (r.overflow > 1) {
      add({
        check: 'reflow:horizontal-scroll', url, viewport: String(width), wcag: ['1.4.10'], level: 'A/AA', severity: 'fail',
        selector: r.offenders.map((o) => `${o.selector} (right ${o.right})`).join('; ') || 'document',
        measured: `page scrolls sideways by ${r.overflow} px at ${width} CSS px (${width === 320 ? '400' : '200'}% zoom of 1280)`,
      });
    }
    // past the right edge with no way to scroll to it: inside a wrapper that hides overflow, or on a page that hides it
    const cutOff = [...r.cut, ...(r.overflow > 1 ? [] : r.offenders)];
    if (cutOff.length) {
      add({
        check: 'reflow:cut-off', url, viewport: String(width), wcag: ['1.4.10'], level: 'A/AA', severity: 'review',
        selector: cutOff.map((o) => `${o.selector} (right ${o.right})`).join('; '),
        measured: `content extends past the right edge at ${width} CSS px inside a box or page that hides overflow, so it is cut off; real if a user needs it`,
      });
    }
    for (const c of r.clipped.slice(0, 10)) {
      add({ check: 'reflow:clipped-text', url, viewport: String(width), wcag: ['1.4.10'], level: 'A/AA', severity: 'review', selector: c.selector, measured: `text cut off on ${c.axis}: "${c.text}"` });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

// apply a stress style, report text that is newly cut off compared with the unstressed page
async function stress(url, check, wcag, level, severity, apply, label) {
  const { context, page } = await open(url);
  try {
    const before = new Map((await page.evaluate(() => window.__uq.clipped())).map((c) => [c.selector, c.hidden]));
    const overflowBefore = await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
    await page.evaluate(apply);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__uq.clipped());
    const overflowAfter = await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
    await shot(page, `${slug(url)}-${check}`);
    // new clipping, or a box that already clipped and now hides more
    for (const c of after.filter((c) => !before.has(c.selector) || c.hidden > before.get(c.selector) + 2).slice(0, 15)) {
      const was = before.has(c.selector) ? ` (${before.get(c.selector)} px hidden before, ${c.hidden} px now)` : '';
      // a box that already cut its text off (an ellipsis, a line clamp) lost content before the stress; a person decides
      add({ check: `${check}:clipped-text`, url, viewport: '1280', wcag, level, severity: was ? 'review' : severity, selector: c.selector, measured: `${label}: text now cut off on ${c.axis}: "${c.text}"${was}` });
    }
    if (overflowAfter > overflowBefore + 1) {
      add({ check: `${check}:horizontal-scroll`, url, viewport: '1280', wcag, level, severity, selector: 'document', measured: `${label}: page now scrolls sideways by ${overflowAfter} px` });
    }
  } finally {
    await context.close();
  }
}

async function layoutShift(page, url) {
  const shifts = await page.evaluate(() => window.__uq.shifts);
  // largest session window (gap under 1 s, window under 5 s), the way CLS is scored; but only
  // load and settle are recorded, so this is a lower bound of the CLS a visit would see
  let best = 0, cur = 0, start = 0, last = -Infinity, bestSources = [], curSources = [];
  for (const s of shifts) {
    if (s.t - last > 1000 || s.t - start > 5000) { cur = 0; start = s.t; curSources = []; }
    cur += s.value; last = s.t; curSources.push(...s.sources);
    if (cur > best) { best = cur; bestSources = [...curSources]; }
  }
  if (best > 0.1) {
    add({
      check: 'shift:load', url, viewport: '1280', wcag: [], level: 'craft', severity: 'review',
      selector: [...new Set(bestSources)].slice(0, 8).join('; ') || 'unknown',
      measured: `layout shift ${best.toFixed(3)} during load and the first ${opts.settle} ms`, threshold: 'CLS good under 0.1, poor over 0.25 (Core Web Vitals); this is a lower bound',
    });
  }
  return best;
}

async function motion(url) {
  const sample = async (reducedMotion) => {
    const { context, page } = await open(url, { reducedMotion });
    try {
      const anims = await page.evaluate(() => document.getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => {
          const t = a.effect?.getTiming?.() || {};
          return { target: window.__uq.sel(a.effect?.target), name: a.animationName || a.transitionProperty || a.id || 'animation', duration: Number(t.duration) || 0, iterations: t.iterations };
        })
        .filter((a) => a.iterations === Infinity || a.duration >= 1000));
      const videos = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => !v.paused && !v.ended).map((v) => window.__uq.sel(v)));
      const a = await page.screenshot();
      // 700 ms, not a round second: a loop with a 1 or 2 s period would look unchanged
      await page.waitForTimeout(700);
      const b = await page.screenshot();
      const vp = page.viewportSize();
      const d = await pixels({ op: 'diff', a: a.toString('base64'), b: b.toString('base64'), rect: { x: 0, y: 0, width: vp.width, height: vp.height }, threshold: 48 });
      return { anims, videos, moving: d.total ? d.changed / d.total : 0 };
    } finally {
      await context.close();
    }
  };
  const normal = await sample('no-preference');
  const reduced = await sample('reduce');
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  if (reduced.anims.length || reduced.videos.length || reduced.moving > 0.002) {
    // no WCAG criterion requires honouring the setting (2.3.3 covers motion caused by interaction),
    // so this is craft; "ignored" means the setting changed nothing that is on screen
    const ignored = normal.anims.length && reduced.anims.length >= normal.anims.length
      && (reduced.moving > 0.0005 || reduced.videos.length > 0) && reduced.moving >= normal.moving * 0.8;
    add({
      check: 'motion:reduced', url, viewport: '1280', wcag: [], level: 'craft', severity: 'review',
      selector: [...reduced.anims.map((a) => `${a.target} (${a.name}, ${a.iterations === Infinity ? 'infinite' : `${a.duration} ms`})`), ...reduced.videos.map((v) => `${v} (playing video)`)].slice(0, 10).join('; ') || 'canvas or script-driven motion',
      measured: `with reduced motion: ${reduced.anims.length} long or looping animations, ${reduced.videos.length} playing videos, ${pct(reduced.moving)} of the viewport changing within 0.7 s (without: ${normal.anims.length}, ${normal.videos.length}, ${pct(normal.moving)})`,
      threshold: ignored ? 'the reduced-motion setting changes nothing on screen' : 'confirm each remaining motion is essential or tiny',
    });
  }
  if (normal.anims.some((a) => a.iterations === Infinity) || normal.videos.length) {
    add({ check: 'motion:pause-control', url, viewport: '1280', wcag: ['2.2.2'], level: 'A/AA', severity: 'review', selector: [...normal.anims.filter((a) => a.iterations === Infinity).map((a) => a.target), ...normal.videos].slice(0, 8).join('; '), measured: 'looping animation or autoplaying video; if it runs over 5 s beside other content it needs pause, stop or hide' });
  }
}

async function dark(url) {
  const { context, page } = await open(url, { colorScheme: 'dark' });
  try {
    const supports = await page.evaluate(() => {
      // walk @layer, @supports, @media, nesting and @import, not only top-level rules
      const walk = (rules) => {
        for (const r of rules) {
          if (r.media && /prefers-color-scheme/.test(r.media.mediaText)) return true;
          let inner = null;
          try { inner = r.styleSheet ? r.styleSheet.cssRules : r.cssRules; } catch { /* cross-origin import */ }
          if (inner && walk(inner)) return true;
        }
        return false;
      };
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        if (walk(rules)) return true;
      }
      return [...document.querySelectorAll('meta[name="color-scheme"]')].some((m) => /dark/.test(m.content)) || /dark/.test(getComputedStyle(document.documentElement).colorScheme);
    });
    if (!supports) { notes.push(`${url}: no dark-scheme styles found in readable stylesheets (cross-origin ones cannot be read) and no class or attribute toggle tried; dark mode not checked`); return; }
    await shot(page, `${slug(url)}-dark`);
    if (on('axe') && axeSource) {
      await injectAxe(page, url);
      const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations'] }));
      for (const v of res.violations) for (const n of v.nodes.slice(0, 15)) {
        add({ check: 'dark:color-contrast', url, viewport: '1280 dark', wcag: ['1.4.3'], level: 'A/AA', severity: 'fail', selector: fmtTarget(n.target), measured: n.failureSummary?.split('\n').slice(1).join(' ').trim() || v.help });
      }
    }
  } finally {
    await context.close();
  }
}

async function phone(url) {
  const { context, page } = await open(url, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  try {
    await shot(page, `${slug(url)}-375`);
    // without a working viewport tag a phone lays the page out at desktop width and shrinks it to fit,
    // so every CSS px size overstates what the user sees
    const vp = await page.evaluate(() => ({ layout: document.documentElement.clientWidth, tag: document.querySelector('meta[name="viewport"]')?.content ?? null }));
    const scale = vp.layout > 380 ? 375 / vp.layout : 1;
    if (scale < 1) {
      add({ check: 'phone:no-mobile-layout', url, viewport: '375 touch', wcag: [], level: 'craft', severity: 'review', selector: vp.tag === null ? 'no meta[name=viewport]' : `meta[name=viewport] "${vp.tag}"`, measured: `a 375 px phone lays the page out ${vp.layout} px wide and shrinks it to ${Math.round(scale * 100)}%, so text and targets show smaller than their CSS size; touch targets below are scaled to what the phone shows` });
    }
    if (on('axe') && axeSource) {
      await runAxe(page, url, '375 touch', ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
      if (scale < 1) notes.push(`${url}: axe target sizes at 375 px are in CSS px, larger than the phone shows at ${Math.round(scale * 100)}%`);
    }
    const small = await page.evaluate((k) => {
      const { all, style, sel, ownText, topRect, framesShow } = window.__uq;
      const out = [];
      for (const el of all('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [tabindex]:not([tabindex="-1"])')) {
        // the size on the page, after any scaling of the frames around it
        const r = topRect(el);
        if (!r.width || !r.height || !(el.checkVisibility?.({ visibilityProperty: true }) ?? el.getClientRects().length > 0) || !framesShow(el)) continue;
        // inline links inside running text are exempt from target size
        if (el.localName === 'a' && style(el).display === 'inline' && el.parentElement && ownText(el.parentElement)) continue;
        const w = r.width * k, h = r.height * k;
        if (w < 44 || h < 44) out.push(`${sel(el)} ${Math.round(w)}x${Math.round(h)}`);
      }
      return out;
    }, scale);
    if (small.length) {
      add({ check: 'phone:touch-target', url, viewport: '375 touch', wcag: ['2.5.5'], level: 'AAA', severity: 'advisory', selector: small.slice(0, 12).join('; '), measured: `${small.length} controls under 44x44 ${scale < 1 ? 'px as the phone shows them' : 'CSS px'}`, threshold: '44 pt (Apple HIG), 48 dp (Material); WCAG AA minimum is 24 px, which axe target-size checks' });
    }
    // the CSS behind three things only a real phone shows: hover a tap leaves stuck,
    // inputs iOS Safari zooms into on focus, and the browser's own tap flash
    const feel = await page.evaluate(() => {
      const { roots, all, style, sel, topRect, framesShow } = window.__uq;
      const ungated = new Set(), unread = new Set();
      let hoverNone = false;
      // the queries of a media list; Chrome turns an alternative with an unknown feature into "not all", which never matches
      const queriesOf = (media) => (media?.mediaText ?? '').split(',').map((q) => q.trim()).filter((q) => q && q !== 'not all');
      // (hover), (hover: hover) and (pointer: fine) leave touch-only screens out, but only when every
      // comma-separated query asks for one; "not" or "or" can let a phone in, so those count as ungated.
      // any-hover and any-pointer describe a secondary input (a mouse on a touch phone), so they never gate
      const asksHover = (media) => {
        const queries = queriesOf(media);
        return queries.length > 0 && queries.every((q) => !/\b(not|or)\b/i.test(q) && /\(\s*(hover\s*(:\s*hover\s*)?|pointer\s*:\s*fine\s*)\)/.test(q));
      };
      const printOnly = (media) => { const queries = queriesOf(media); return queries.length > 0 && queries.every((q) => /^(only\s+)?print\b/i.test(q)); };
      // a nested selector with its parents, so `.a { &:hover {} }` reads ".a:hover"
      const nested = (parent, s) => !parent ? s : s.includes('&') ? s.replace(/&/g, parent) : `${parent} ${s}`;
      // flags a declaration block that applies while hovering and sits outside every hover gate: a :hover
      // rule's own declarations, or rules and declarations nested under one. A :hover rule that only holds
      // a gated @media (Tailwind v4 before minification) has no declarations of its own and passes.
      const walk = (rules, gated, hover, parent) => {
        for (const rule of rules) {
          if (printOnly(rule.media)) continue;
          // media rules and @import carry a media list; both can gate what they hold
          const inside = gated || asksHover(rule.media);
          if (/\(\s*(any-)?hover\s*:\s*none\s*\)/.test(rule.media?.mediaText ?? '')) hoverNone = true;
          const label = rule.selectorText ? nested(parent, rule.selectorText) : parent;
          const hovering = rule.selectorText?.includes(':hover') ? label : hover;
          if (hovering && !inside && rule.style?.length) ungated.add(hovering);
          if (rule.styleSheet) read(rule.styleSheet, inside);
          // nested CSS and grouping rules hold rules of their own
          if (rule.cssRules) walk(rule.cssRules, inside, hovering, label);
        }
      };
      const read = (sheet, gated) => {
        if (sheet.disabled || printOnly(sheet.media)) return;
        let rules;
        try { rules = sheet.cssRules; } catch { unread.add(sheet.href || 'inline'); return; }
        walk(rules, gated || asksHover(sheet.media), null, '');
      };
      for (const root of roots()) for (const sheet of [...(root.styleSheets || []), ...(root.adoptedStyleSheets || [])]) read(sheet, false);
      const smallInputs = [], flash = [];
      // visibility: hidden keeps a box, so check the element itself as well as the frames around it
      const shown = (el) => { const r = topRect(el); return r.width && r.height && (el.checkVisibility?.({ visibilityProperty: true }) ?? el.getClientRects().length > 0) && framesShow(el); };
      for (const el of all('input, textarea, select')) {
        // a disabled field never takes focus, so it never zooms; :disabled also covers a disabled fieldset
        if (el.matches(':disabled') || (el.localName === 'input' && /^(hidden|checkbox|radio|range|color|file|button|submit|reset|image)$/.test(el.type))) continue;
        const px = parseFloat(style(el).fontSize);
        if (shown(el) && px < 16) smallInputs.push(`${sel(el)} ${Math.round(px * 10) / 10}px`);
      }
      // any colour syntax the browser understands (rgb, oklch, color(), color-mix): paint it and read the alpha back
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const alphaOf = (c) => {
        if (!c || c === 'transparent') return 0;
        if (!ctx) { const parts = c.match(/rgba?\(([^)]*)\)/)?.[1].split(/[\s,/]+/).filter(Boolean); return !parts ? 1 : parts.length > 3 ? parseFloat(parts[3]) : 1; }
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#0000';
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data[3];
      };
      for (const el of all('a[href], button, [role=button], [role=link], [role=tab], summary, label, select, input:not([type=hidden])')) {
        const c = style(el).webkitTapHighlightColor || '';
        if (shown(el) && alphaOf(c) > 0) flash.push(`${sel(el)} ${c}`);
      }
      return { ungated: [...ungated], unread: [...unread], hoverNone, smallInputs, flash };
    });
    if (feel.ungated.length) {
      add({ check: 'phone:ungated-hover', url, viewport: '375 touch', wcag: [], level: 'craft', severity: 'review', selector: feel.ungated.slice(0, 12).join('; '), measured: `${feel.ungated.length} hover selectors with styles outside a media query that leaves touch screens out ((hover), (hover: hover) or (pointer: fine)); on touch a tap applies them and they stay until the next tap elsewhere${feel.hoverNone ? '; the page also has (hover: none) rules, which may undo some of them' : ''}` });
    }
    if (feel.unread.length) notes.push(`${url}: phone:ungated-hover could not read ${feel.unread.length} cross-origin stylesheet(s), first ${feel.unread[0]}`);
    if (feel.smallInputs.length) {
      add({ check: 'phone:input-zoom', url, viewport: '375 touch', wcag: [], level: 'craft', severity: 'review', selector: feel.smallInputs.slice(0, 12).join('; '), measured: `${feel.smallInputs.length} text fields under 16 CSS px${scale < 1 ? `, shown smaller still at ${Math.round(scale * 100)}%` : ''}; iOS Safari zooms the page when one takes focus and does not zoom back out`, threshold: '16 px' });
    }
    if (feel.flash.length) {
      add({ check: 'phone:tap-highlight', url, viewport: '375 touch', wcag: [], level: 'craft', severity: 'review', selector: feel.flash.slice(0, 12).join('; '), measured: `${feel.flash.length} controls keep the browser's tap highlight, a translucent box iOS Safari and Android Chrome flash over the control on every tap; set -webkit-tap-highlight-color: transparent and give each control its own :active style` });
    }
  } finally {
    await context.close();
  }
}

// whether the page loaded whole: requests that failed, uncaught script errors, broken images, the h1's font,
// videos that fail or stall, and a white first paint under a page whose own background is not white
async function integrity(url) {
  const failed = new Map(), errors = new Map();
  let lightest = null, docAnswered = false, cdpPaint = null, paintErrors = 0;
  const started = Date.now();
  // the page's own Content-Security-Policy applies here, as it does for a visitor: what it blocks fails
  const { context, page } = await open(url, { bypassCSP: false }, {
    before: (p) => {
      p.on('requestfailed', (r) => {
        const why = r.failure()?.errorText || 'failed';
        // cancelled by the page or the browser (a navigation, a media range request), not a broken resource
        if (why.includes('ERR_ABORTED')) return;
        failed.set(r.url(), { type: r.resourceType(), measured: why });
      });
      p.on('response', (r) => {
        // the first answer for the document itself is checked when it opens (--allow-error-status lets an error
        // page through on purpose); a later navigation of the page, such as a script redirect, is not
        if (r.request().isNavigationRequest() && r.frame() === p.mainFrame() && !(r.status() >= 300 && r.status() < 400)) {
          const first = !docAnswered;
          docAnswered = true;
          if (first) return;
        }
        if (r.status() < 400) return;
        failed.set(r.url(), { type: r.request().resourceType(), measured: `HTTP ${r.status()}` });
      });
      p.on('pageerror', (e) => {
        const key = `${e.name || 'Error'}: ${e.message}`.replace(/\s+/g, ' ').slice(0, 200);
        const where = (e.stack || '').split('\n').map((l) => l.trim()).find((l) => l.startsWith('at '))?.slice(3) || null;
        const seen = errors.get(key);
        if (seen) seen.count++;
        else errors.set(key, { where, count: 1 });
      });
    },
    // the lightest frame from navigation to the end of the settle time. Playwright's screenshot first waits for
    // document.fonts.ready, which can be seconds late; DevTools captures each frame as it is
    paint: async (p) => {
      try {
        cdpPaint ??= await p.context().newCDPSession(p);
        const buf = Buffer.from((await cdpPaint.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
        const share = await pixels({ op: 'light', a: buf.toString('base64') });
        if (!lightest || share > lightest.share) lightest = { buf, share, t: Date.now() - started };
      } catch {
        // nothing painted yet, or a frame the browser could not capture; the next sample tries again
        paintErrors++;
      }
    },
  });
  try {
    await cdpPaint?.detach().catch(() => { /* already gone */ });
    const pct = (x) => `${(x * 100).toFixed(1)}%`;
    const short = (u) => (u.length > 120 ? `${u.slice(0, 117)}...` : u);
    const base = { url, viewport: '1280', wcag: [], level: 'craft', severity: 'review' };

    // lazy images below the fold are never requested during load; load them now so a broken one is seen
    const lazy = await page.evaluate(() => {
      const waiting = window.__uq.all('img[loading="lazy"]').filter((i) => !i.complete);
      const done = Promise.all(waiting.map((i) => new Promise((r) => {
        i.addEventListener('load', r, { once: true });
        i.addEventListener('error', r, { once: true });
        i.loading = 'eager';
      })));
      return Promise.race([done.then(() => ({ count: waiting.length, timedOut: false })), new Promise((r) => setTimeout(() => r({ count: waiting.length, timedOut: true }), 5000))]);
    });
    if (lazy.timedOut) notes.push(`${url}: ${lazy.count} lazy images were loaded for page:broken-image and some had not finished after 5 s`);

    // same-site failures first, so third-party trackers an ad blocker stops cannot push them out of the list
    const site = (u) => { try { return new URL(u).hostname.split('.').slice(-2).join('.'); } catch { return ''; } };
    const own = site(page.url());
    const failures = [...failed].sort(([a], [b]) => (site(a) === own ? 0 : 1) - (site(b) === own ? 0 : 1));
    for (const [res, f] of failures.slice(0, 15)) {
      add({ ...base, check: 'page:failed-request', selector: res, measured: `${f.type} request ${f.measured}` });
    }
    if (failures.length > 15) {
      const hosts = [...new Set(failures.slice(15).map(([u]) => { try { return new URL(u).hostname; } catch { return u.slice(0, 40); } }))];
      notes.push(`${url}: page:failed-request has ${failures.length - 15} more failed requests, to ${hosts.slice(0, 8).join(', ')}${hosts.length > 8 ? ` and ${hosts.length - 8} more hosts` : ''}`);
    }
    for (const [message, e] of [...errors].slice(0, 15)) {
      // an error with no stack frame (a thrown string or object) is told apart by its message
      add({ ...base, check: 'page:error', selector: e.where || `window: ${message.slice(0, 80)}`, measured: `uncaught ${message}${e.count > 1 ? ` (${e.count} times)` : ''}` });
    }
    if (errors.size > 15) notes.push(`${url}: page:error has ${errors.size - 15} more distinct errors`);

    // a white first paint matters only under a page whose own colour is not white. The backdrop is the first
    // background colour (or CSS gradient) found from the middle of the viewport up to the root; an image that
    // arrives late over a white page is content, not the page's colour
    const late = await page.screenshot();
    const settled = await pixels({ op: 'light', a: late.toString('base64') });
    const backdrop = await page.evaluate(() => {
      // any colour syntax the browser understands (rgb, oklch, color(), color-mix): paint it and read it back
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const near = (c) => {
        if (!c || c === 'transparent') return null;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#0000';
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return a < 230 ? null : { light: r >= 235 && g >= 235 && b >= 235, color: c };
      };
      for (let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); el; el = el.parentElement) {
        const cs = getComputedStyle(el);
        // a gradient paints above the element's background colour, and at once even when layered with an image,
        // so it is read first; the 50-point drop the flash also needs keeps a light gradient from counting
        if (/gradient\(/.test(cs.backgroundImage)) return { light: false, color: 'a CSS gradient' };
        const solid = near(cs.backgroundColor);
        if (solid) return solid;
      }
      return { light: true, color: 'the browser default white' };
    });
    if (lightest) {
      const file = join(opts.out, `${slug(url)}-early.png`);
      writeFileSync(file, lightest.buf);
      shots.push(file);
      if (lightest.share - settled >= 0.5 && !backdrop.light) {
        add({ ...base, check: 'page:white-flash', selector: 'document', measured: `${pct(lightest.share)} of the viewport near-white ${lightest.t} ms after navigation started, ${pct(settled)} once loaded and settled; the page's background is ${backdrop.color}, but it first paints white`, threshold: 'the first paint already uses the page background' });
      }
    } else notes.push(`${url}: no frame could be captured while the page loaded (${paintErrors} attempts); page:white-flash not checked`);

    const state = await page.evaluate(() => {
      const { all, sel, style, topRect, framesShow } = window.__uq;
      const unquote = (s) => s.trim().replace(/^["']|["']$/g, '').replace(/\\(.)/g, '$1');
      const shown = (el) => (el.checkVisibility?.({ visibilityProperty: true }) ?? el.getClientRects().length > 0) && framesShow(el);
      // an empty or missing src is a placeholder a script fills in, not a broken file
      const broken = all('img').filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.getAttribute('src')))
        .map((i) => ({ selector: sel(i), src: i.currentSrc || i.src }));
      const videos = all('video').map((v) => {
        const r = topRect(v);
        return {
          selector: sel(v), src: v.currentSrc || v.src || v.querySelector('source')?.src || '',
          hasSource: !!(v.getAttribute('src') || v.querySelector('source[src]')),
          // Chrome pauses muted autoplay video outside the viewport and resumes it in view, so playback is judged only in view
          // r.framed: every iframe around it shows it, not only the top viewport
          inView: shown(v) && r.framed && r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
          error: v.error?.code ?? null, network: v.networkState, ready: v.readyState, paused: v.paused, ended: v.ended,
          autoplay: v.autoplay, muted: v.muted, inline: v.playsInline, poster: !!v.poster,
        };
      });
      // the first visible h1 in the page, and in it the first text with a letter (an emoji or an icon has none)
      // outside SVG; that text can sit in a span with a font of its own
      let font = null, h1Note = null;
      const h1 = [...document.querySelectorAll('h1')].find((h) => shown(h) && h.getClientRects().length);
      if (!h1) h1Note = document.querySelector('h1') ? 'no visible h1' : 'no h1';
      else {
        const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
        let el = null, text = '';
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (/\p{L}/u.test(n.textContent) && !n.parentElement.closest('svg') && shown(n.parentElement)) { el = n.parentElement; text = n.textContent.trim(); break; }
        }
        if (!el) h1Note = 'the visible h1 has no text with letters';
        else {
          const stack = style(el).fontFamily;
          const families = stack.split(',').map(unquote).filter(Boolean);
          const isGeneric = (f) => /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|math|emoji|fangsong|-apple-system|BlinkMacSystemFont)$/i.test(f);
          const ownFaces = [...document.fonts].filter((f) => unquote(f.family).toLowerCase() === families[0].toLowerCase());
          const faces = ownFaces.map((f) => f.status);
          // whether any face's unicode-range covers a character of the heading text; a face for other characters
          // (a latin-ext subset over Japanese text) is never loaded for it, by design
          const inRange = (range, cp) => range.split(',').some((part) => {
            const [a, b] = part.trim().replace(/^u\+/i, '').split('-');
            const lo = parseInt(a.replace(/\?/g, '0'), 16), hi = parseInt((b ?? a).replace(/\?/g, 'F'), 16);
            return cp >= lo && cp <= hi;
          });
          const chars = [...text].filter((c) => c.trim()).map((c) => c.codePointAt(0));
          const facesCover = ownFaces.some((f) => chars.some((cp) => inRange(f.unicodeRange || 'U+0-10FFFF', cp)));
          // kept for the DevTools reads below, which take the element itself rather than a selector
          window.__uq.fontTarget = el;
          font = { selector: sel(el), stack, families, generic: isGeneric(families[0]), named: families.filter((f) => !isGeneric(f)), faces, facesCover, text: text.slice(0, 200) };
        }
      }
      return { broken, videos, font, h1Note };
    });

    for (const img of state.broken.slice(0, 15)) {
      add({ ...base, check: 'page:broken-image', selector: img.selector, measured: `image finished loading with no picture (naturalWidth 0): ${short(img.src)}` });
    }
    if (state.broken.length > 15) notes.push(`${url}: page:broken-image has ${state.broken.length - 15} more broken images`);

    const mediaError = { 1: 'loading aborted', 2: 'network error', 3: 'could not decode', 4: 'format or address not supported' };
    let outOfView = 0;
    for (const v of state.videos.slice(0, 15)) {
      // no source at all and nothing requested: a placeholder a script fills in, like an img without src
      if (!v.hasSource && v.network === 0 && !v.error) continue;
      const problems = [];
      if (v.error) problems.push(`error ${v.error} (${mediaError[v.error] || 'unknown'})`);
      // every <source> failed or has a type the browser cannot play: Chrome sets no error, only NETWORK_NO_SOURCE
      else if (v.network === 3) problems.push('no playable source (every source failed or has a type this browser cannot play)');
      else if (v.inView) {
        if (v.ready < 2 && v.network === 2) problems.push(`still loading after load and settle (readyState ${v.ready})`);
        else {
          // a short video that played to its end is paused too
          if (v.autoplay && v.paused && !v.ended) problems.push('has autoplay but is paused after load');
          if (v.ready < 2 && (v.autoplay || !v.poster)) problems.push(`no frame loaded (readyState ${v.ready})${v.poster ? '' : ' and no poster, so it shows an empty box'}`);
        }
      } else outOfView++;
      // browsers block autoplay with sound for a new visitor, and iPhone Safari autoplays inline only with playsinline
      if (v.autoplay && !v.muted) problems.push('autoplay without muted, which browsers block for visitors who have not interacted with the site');
      if (v.autoplay && !v.inline) problems.push('autoplay without playsinline, which iPhone Safari needs to play it in the page');
      if (problems.length) add({ ...base, check: 'page:video-stuck', selector: v.selector, measured: `${problems.join('; ')}; source ${short(v.src) || 'none'}` });
    }
    if (outOfView) notes.push(`${url}: ${outOfView} videos outside the first viewport or hidden were checked for errors and missing muted or playsinline only; Chrome pauses muted autoplay video out of view, so whether they play was not judged`);
    if (state.videos.length > 15) notes.push(`${url}: page:video-stuck checked the first 15 of ${state.videos.length} videos`);

    const f = state.font;
    if (!f) notes.push(`${url}: ${state.h1Note}, so the heading font was not checked`);
    else if (!f.generic) await headingFont(page, context, f, url, base);
  } finally {
    await context.close();
  }
}

// whether the h1's text is drawn in the font it names. Each answer comes from the font Chrome actually drew with
// (DevTools CSS.getPlatformFontsForNode), compared by name with what the same text draws in a test span, so a
// local() source, a localized family name or a font for another script is judged by what it draws
async function headingFont(page, context, f, url, base) {
  let cdp;
  try {
    cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await cdp.send('DOM.getDocument', { depth: 0 });
    // fonts of an element an expression returns, the most-used first
    const fontsOf = async (expression) => {
      const { result } = await cdp.send('Runtime.evaluate', { expression });
      if (!result.objectId) return [];
      const { nodeId } = await cdp.send('DOM.requestNode', { objectId: result.objectId });
      return nodeId ? (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.sort((a, b) => b.glyphCount - a.glyphCount) : [];
    };
    // every font a span draws text with in the given font-family, styled like the h1's text; the span is held
    // by reference, so nothing on the page can be mistaken for it. Reading offsetWidth lays it out: DevTools
    // reports no fonts for a node that has not been laid out yet
    const draws = async (family, text) => fontsOf(`(() => { const el = window.__uq.fontTarget, cs = getComputedStyle(el), s = document.createElement('span');
        s.textContent = ${JSON.stringify(text)};
        s.lang = el.closest('[lang]')?.lang || '';
        // !important on the inline style outranks a page rule such as * { font-family: X !important }
        s.style.cssText = 'position:absolute!important;left:-9999px!important;top:0!important;white-space:nowrap!important';
        s.style.setProperty('font-family', ${JSON.stringify(family)}, 'important');
        for (const p of ['font-weight', 'font-style', 'font-stretch', 'font-size', 'font-variant', 'font-feature-settings', 'font-variation-settings', 'text-transform']) s.style.setProperty(p, cs.getPropertyValue(p), 'important');
        document.body.appendChild(s); void s.offsetWidth; window.__uq.fontRef?.remove(); window.__uq.fontRef = s; return s; })()`);
    const key = (d) => `${d.familyName}|${d.isCustomFont}`;
    // the fonts in `list` that `base` does not draw: what a family contributes beyond the fallback, for any share
    // of the glyphs (a Japanese font may draw two characters of a mostly Latin heading)
    const beyond = (list, base) => { const b = new Set(base.map(key)); return list.filter((d) => !b.has(key(d))); };
    const has = (list, d) => list.some((x) => key(x) === key(d));
    const css = (name) => `"${name.replace(/["\\]/g, '\\$&')}"`;
    const SAMPLE = 'Hamburgefonstiv';
    const drawn = await fontsOf('window.__uq.fontTarget');
    const used = drawn.length ? drawn.map((d) => d.familyName).join(', ') : null;
    // a family no font answers to falls back to the browser's default font
    const fallback = async (text) => draws('"uq-no-such-font-7f3a"', text);
    // installed (or answered by an @font-face): the fonts the family draws beyond a generic family it is put in
    // front of, for Latin sample text or for the heading's own text (a font for another script has no Latin)
    const installed = async (name) => {
      for (const text of [SAMPLE, f.text]) {
        for (const generic of ['monospace', 'serif']) {
          const own = beyond(await draws(`${css(name)}, ${generic}`, text), await draws(generic, text));
          if (own.length) return own;
        }
      }
      return [];
    };
    const first = f.families[0];
    const statuses = [...new Set(f.faces)].join(', ');
    let problem = null;
    if (!drawn.length) notes.push(`${url}: could not read which font drew the h1; heading font not checked`);
    else if (f.faces.length) {
      if (!f.faces.includes('loaded')) {
        // faces left unloaded because none covers this text are not a failure
        if (!f.facesCover && f.faces.every((s) => s === 'unloaded')) return;
        problem = `"${first}" is a web font on this page (status ${statuses})${f.faces.includes('loading') ? ' and still loading after load and settle' : ''}; drawn with ${used}`;
      } else {
        // the fonts the family draws for the heading's own text beyond the default font must all be in the heading.
        // When it draws none of that text, it may be a font for another script (a Latin font over Japanese text, a
        // later family draws those glyphs by design): it passes if it draws Latin sample text, else the page cannot use it
        const own = beyond(await draws(css(first), f.text), await fallback(f.text));
        if (own.length) {
          const missing = own.filter((d) => !has(drawn, d));
          if (missing.length) problem = `"${first}" is a web font on this page (status ${statuses}); drawn with ${used} instead of ${missing.map((d) => d.familyName).join(', ')}, which "${first}" draws now`;
        } else if (f.facesCover && !beyond(await draws(css(first), SAMPLE), await fallback(SAMPLE)).length) {
          // a face whose unicode-range covers none of the heading text (a Cyrillic subset over an English heading)
          // is meant for other characters, loaded or not; only a face that should draw this text can fail it
          problem = `"${first}" is a web font on this page (status ${statuses}) but draws no text of its own, so the page cannot use it (font-display: optional past its window, or no face covers this text); drawn with ${used}`;
        }
      }
    } else if (!(await installed(first)).length) {
      // not installed here: fine when a later named family in the stack drew the text, as the stack intends
      const later = [];
      for (const name of f.named.filter((n) => n !== first).slice(0, 5)) later.push(...(await installed(name)));
      if (later.some((l) => has(drawn, l))) notes.push(`${url}: the h1's first font "${first}" is not installed on this machine; drawn with ${used} from later in its font stack`);
      else problem = `"${first}" has no @font-face on this page and is not installed on this machine, and no later named font in the stack drew the text; drawn with ${used}`;
    }
    if (problem) add({ ...base, check: 'page:font-fallback', selector: f.selector, measured: `${problem}; font-family is ${f.stack}` });
  } catch (err) {
    notes.push(`${url}: could not compare the h1's fonts (${err.message.split('\n')[0]}); heading font not checked`);
  } finally {
    await page.evaluate(() => window.__uq.fontRef?.remove()).catch(() => { /* page gone */ });
    await cdp?.detach().catch(() => { /* already gone */ });
  }
}

if (!on('axe')) notes.push('axe skipped: contrast over images and dark-mode contrast depend on it and were not measured either; axe rules at 320 and 375 px were not run');
const pages = [];
try {
  for (const url of opts.urls) {
    const entry = { url, ok: true, cls: null, focusOrder: [], checks: {} };
    pages.push(entry);
    console.log(`[probe] ${url}`);
    // run one check and record what happened to it; an error is reported, not allowed to hide the checks after it
    const step = async (name, fn) => {
      if (!on(name)) { entry.checks[name] = 'skipped'; return; }
      try {
        await fn();
        entry.checks[name] ??= 'ran';
      } catch (err) {
        entry.checks[name] = `error: ${err.message.split('\n')[0]}`;
        console.error(`[probe] ${url} ${name}: ${entry.checks[name]}`);
      }
    };
    try {
      let { context, page } = await open(url);
      try {
        const loaded = page.url();
        await step('shift', async () => { entry.cls = await layoutShift(page, url); });
        await shot(page, `${slug(url)}-1280`);
        let incomplete = [];
        await step('axe', async () => {
          incomplete = await runAxe(page, url, '1280', ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']);
          await nameGaps(page, url);
        });
        await step('contrast', async () => {
          if (!axeSource || entry.checks.axe !== 'ran') { entry.checks.contrast = 'not run: needs axe'; return; }
          await compositedContrast(page, url, incomplete);
        });
        let navigated = false;
        await step('focus', async () => { ({ order: entry.focusOrder, navigated } = await focusWalk(page, url)); });
        if (navigated || !samePage(page.url(), loaded)) {
          // reflow measures the page that was asked for, not the one focus led to
          await context.close();
          ({ context, page } = await open(url));
        }
        await step('reflow', () => reflow(page, url));
      } finally {
        await context.close();
      }
      await step('spacing', async () => {
        await stress(url, 'spacing', ['1.4.12'], 'A/AA', 'fail', () => {
          const s = document.createElement('style');
          s.textContent = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';
          document.head.appendChild(s);
        }, 'WCAG text spacing');
      });
      await step('textscale', async () => {
        await stress(url, 'textscale', ['1.4.4'], 'A/AA', 'review', () => {
          const els = [...document.body.querySelectorAll('*')];
          const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
          els.forEach((el, i) => el.style.setProperty('font-size', `${sizes[i] * 2}px`, 'important'));
        }, 'text-only 200%');
      });
      await step('motion', () => motion(url));
      await step('dark', () => dark(url));
      await step('phone', () => phone(url));
      await step('page', () => integrity(url));
    } catch (err) {
      entry.ok = false;
      entry.error = err.message.split('\n')[0];
      console.error(`[probe] ${url}: ${entry.error}`);
    }
  }
} finally {
  await browser.close();
}

const order = { fail: 0, review: 1, advisory: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.url.localeCompare(b.url) || a.check.localeCompare(b.check));
for (const [i, finding] of findings.entries()) finding.id = `F${String(i + 1).padStart(3, '0')}`;
const counts = Object.fromEntries(Object.keys(order).map((k) => [k, findings.filter((f) => f.severity === k).length]));
const undecided = [...axeReview.values()];
const notMeasured = [
  'Whether names, alt text, labels and error messages make sense; reading and focus order that is legal but confusing.',
  'Screen reader announcements, live regions, dialogs and menus in use, keyboard operation beyond Tab.',
  'Anything that needs a click, a keystroke other than Tab, typing or a submit: errors, menus, tooltips, toasts.',
  'Controls Tab never reaches when nothing styles them as clickable; only a person or the code shows them.',
  'States the URL did not show: empty, loading, error, long content, no permission, signed out.',
  'Widths other than 320, 375, 640 and 1280, and the 256 px tall reflow case for content that scrolls sideways. Narrow viewports do not prove actual browser zoom behavior. Focus, names, motion, layout shift, contrast over images and the stress tests run at 1280 only.',
  'Dark themes switched by a class or data attribute, and styles in cross-origin stylesheets. Dark-mode axe incompletes are not collected.',
  'Layout shift after the settle time; the figure above covers load only.',
  'Under text spacing and enlarged text: text that overlaps its neighbours in a box that does not hide overflow; only cut-off text is measured, at 1280 px only.',
  'Canvas, WebGL, and what media shows (captions, the picture itself); page:video-stuck checks only that videos load and play. Inside cross-origin iframes only axe runs; focus markers, names, contrast over images and targets there are not measured. Reflow, text stress, motion and layout shift look at the top page only. Closed shadow roots are not reached.',
  'Text whose colour comes from `filter`, `mix-blend-mode` or `background-clip: text`; contrast over images accounts for colour and opacity only.',
  'Phone behaviour only hardware shows: the input zoom, tap delay and tap flash themselves, hover left behind after a tap, safe areas, the software keyboard and overscroll. The phone checks report the CSS behind three of them; hover rules in cross-origin stylesheets are not read.',
  'Page integrity covers one desktop load until the settle time ends, plus lazy images loaded on purpose: requests that fail and errors thrown later, after an interaction, or only at phone width are not seen; requests a service worker makes for itself are not seen; console.error calls that are not uncaught errors are not collected. White-flash frames are sampled about every 100 ms, so a shorter flash can be missed, and a locally served page loads faster than it does for a visitor. Only the first visible h1, and in it the first text with letters, is checked for its font; a heading drawn partly in a fallback because one unicode-range subset failed shows only as a failed request. Whether videos outside the first viewport play is not judged.',
];
const report = { generated: new Date().toISOString(), browser: browserInfo, urls: opts.urls, skipped: [...opts.skip], counts, pages, findings, axeUndecided: undecided, notes, notMeasured, screenshots: shots };
writeFileSync(join(opts.out, 'report.json'), JSON.stringify(report, null, 2));

const cell = (value) => String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const md = [
  `# ui-quality probe`, '',
  `${report.generated}. Fails ${counts.fail}, review ${counts.review}, advisory ${counts.advisory}.${opts.skip.size ? ` Skipped: ${[...opts.skip].join(', ')}.` : ''}`, '',
  `Browser: ${browserInfo}.`, '',
  'Rows below are candidates, not confirmed owner findings. Verify each fail; at full depth also resolve review rows and relevant advisories. IDs refer to this run only. Full evidence and per-viewport observations are in report.json.', '',
  'A check with no finding is not a pass for its WCAG criterion: axe accepts names and labels a person would reject. The `name:` checks catch two of them (a placeholder as the only label, one glyph such as "x" as a name); a name that is present but wrong is not caught.', '',
  'Selectors reach into open shadow roots and iframes: `a >> b` is b inside the shadow root of a, `a >>> b` is b inside iframe a.', '',
  ...pages.map((p) => `- ${p.url}: ${p.ok ? `ran${p.cls !== null ? `, layout shift during load ${p.cls.toFixed(3)}` : ''}, ${p.focusOrder.length} focus stops` : `NOT AUDITED: ${p.error}`}${Object.keys(p.checks).length ? `. Checks: ${Object.entries(p.checks).map(([k, v]) => `${k} ${v}`).join('; ')}` : ''}`), '',
  '| ID | Severity | URL | Check | WCAG / source | Viewport | Where | Measured |', '|---|---|---|---|---|---|---|---|',
  ...findings.map((f) => `| ${f.id} | ${f.severity} | ${cell(f.url)} | ${f.check} | ${f.wcag.join(', ') || f.level} | ${f.viewport} | ${cell(f.selector)} | ${f.observations.map((o) => cell(`${o.viewport}: ${o.measured}${o.threshold ? ` (need ${o.threshold})` : ''}`)).join('<br>')} |`),
  '', '## axe could not decide', '',
  'These require a decision. Desktop contrast may have additional pixel evidence above; other widths have no composited contrast measurement. The first five selectors are listed per rule and viewport; further nodes remain unchecked.', '',
  ...(undecided.length ? undecided.map((u) => `- ${u.url}: ${u.id} (${u.count} elements, ${u.viewports.join(', ')}): ${u.help}. First: \`${u.nodes.join('`, `')}\``) : ['- none']),
  '', '## Notes', '', ...(notes.length ? notes.map((n) => `- ${n}`) : ['- none']),
  '', '## Focus order', '', ...pages.flatMap((p) => [`${p.url}:`, ...p.focusOrder.map((s, i) => `${i + 1}. ${s}`), '']),
  '## Screenshots', '',
  'Names start with the URL position (01, 02, etc.). Suffixes identify width, dark theme, text stress, or the lightest frame captured while the page loaded (early). Baseline screenshots show context, not the transient focus or motion measurements; reproduce those checks when verifying.', '',
  ...shots.map((file) => `- ${file}`), '',
  '## Not measured', '',
  ...notMeasured.map((gap) => `- ${gap}`),
];
writeFileSync(join(opts.out, 'report.md'), md.join('\n') + '\n');
console.log(`[probe] fails ${counts.fail}, review ${counts.review}, advisory ${counts.advisory}`);
console.log(`[probe] report: ${join(opts.out, 'report.md')}`);
// a URL that could not be audited makes the whole run incomplete, with or without --strict
// a URL not audited, or a check that errored, leaves the run incomplete
const checkErrors = pages.some((p) => Object.values(p.checks).some((v) => v.startsWith('error')));
process.exitCode = pages.some((p) => !p.ok) || checkErrors ? 2 : opts.strict && counts.fail ? 1 : 0;
