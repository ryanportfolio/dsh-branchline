// Shared helpers for the walkthrough check scripts: argument parsing, Playwright lookup,
// and a headed Chrome launch that stays out of the operator's way.
//
// Headed on purpose: headless Chromium renders through SwiftShader on the CPU, which
// makes timings meaningless and loads the machine. The window is parked offscreen
// (-2400,-2400) and muted. Never minimize it instead: a minimized window drops
// requestAnimationFrame to about 1 fps. CHROME_PLACE=here shows the window for debugging.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

// --key value pairs, --flag booleans, repeated keys collect into arrays, the rest in _.
export function parseArgs(argv = process.argv.slice(2)) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2), n = argv[i + 1];
    const v = n === undefined || n.startsWith("--") ? true : (i++, n);
    o[k] = o[k] === undefined ? v : [].concat(o[k], v);
  }
  return o;
}

export function need(args, key, hint) {
  if (args[key] === undefined || args[key] === true) { console.error(`missing --${key}${hint ? ` (${hint})` : ""}`); process.exit(2); }
  return args[key];
}

// Playwright is resolved from WALKTHROUGH_PW_FROM, the working directory, or this file's
// folder, walking up to the filesystem root from each.
async function loadChromium() {
  const starts = [process.env.WALKTHROUGH_PW_FROM, process.cwd(), path.dirname(fileURLToPath(import.meta.url))].filter(Boolean);
  for (const start of starts) {
    for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
      const req = createRequire(path.join(dir, "package.json"));
      for (const pkg of ["playwright", "playwright-core"]) {
        try {
          const mod = await import(pathToFileURL(req.resolve(pkg)).href);
          const chromium = mod.chromium || (mod.default && mod.default.chromium);
          if (chromium) return chromium;
        } catch { /* not here */ }
      }
      if (path.dirname(dir) === dir) break;
    }
  }
  throw new Error("playwright or playwright-core not found. Install one in the project (npm i -D playwright-core) or set WALKTHROUGH_PW_FROM to a folder that has it.");
}

export async function launch() {
  const chromium = await loadChromium();
  const place = process.env.CHROME_PLACE === "here" ? [] : ["--window-position=-2400,-2400", "--window-size=1600,1100"];
  const args = [...place, "--mute-audio", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"];
  try { return await chromium.launch({ headless: false, channel: "chrome", args }); }
  catch { return chromium.launch({ headless: false, args }); } // bundled Chromium, still headed; never headless
}

// Opens the player and waits for window.__player.ready.
export async function openPlayer(browser, url, { width = 1440, height = 1000 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e.message)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__player && window.__player.ready, null, { timeout: 20000 });
  page.consoleErrors = consoleErrors;
  return page;
}

export function withQuery(url, query) {
  const u = new URL(url);
  for (const [k, v] of new URLSearchParams(query)) u.searchParams.set(k, v);
  return u.href;
}

export function outDir(args) {
  const out = need(args, "out", "screenshot folder, e.g. <screenshots>/<project>/walkthrough");
  fs.mkdirSync(out, { recursive: true });
  return out;
}
