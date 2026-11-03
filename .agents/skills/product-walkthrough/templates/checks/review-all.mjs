// Contact sheets: every chapter at several points of its timeline, in every theme.
//
// node checks/review-all.mjs --url http://127.0.0.1:4173/player.html --out <screenshots>/<project>/walkthrough/review
//   [--themes dark,light]                 default: every theme in tour.config.js
//   [--points 0.06,0.22,0.4,0.58,0.76,0.97] fractions of each chapter's duration
//   [--width 1440 --height 1000]           browser viewport
//   [chapterId ...]                        default: all chapters
//
// Writes <out>/<id>-<theme>-<t>.png, <out>/sheet-<id>.png and <out>/meta.json, and prints
// errors per chapter. Exit code 1 when any chapter logged an error.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, need, launch, openPlayer, outDir } from "./lib/browser.mjs";

const args = parseArgs();
const url = need(args, "url", "player URL");
const OUT = outDir(args);
const points = String(args.points || "0.06,0.22,0.4,0.58,0.76,0.97").split(",").map(Number);
const width = +(args.width || 1440), height = +(args.height || 1000);

const browser = await launch();
let failed = 0;
try {
  const page = await openPlayer(browser, url, { width, height });
  const list = await page.evaluate(() => window.__player.scenes());
  const themes = args.themes ? String(args.themes).split(",") : await page.evaluate(() => window.__player.themes);
  const only = args._;
  const meta = [];
  // Errors from boot (an actor that did not register, a scene file that threw) belong to no chapter.
  const startup = await page.evaluate(() => window.__player.errors.map(String));
  if (startup.length) { console.log("player startup errors:", JSON.stringify(startup)); failed++; }
  for (const s of list) {
    if (only.length && !only.includes(s.id)) continue;
    const before = await page.evaluate(() => window.__player.errors.length);
    const shots = {};
    for (const theme of themes) {
      shots[theme] = [];
      for (const f of points) {
        const t = Math.round(s.duration * f);
        await page.evaluate((o) => window.__player.set(o), { theme, scene: s.id, t });
        await page.waitForTimeout(350); // images, fonts and the actor's expression easing settle
        const name = `${s.id}-${theme}-${t}.png`;
        await page.locator("#wt-wrap").screenshot({ path: path.join(OUT, name) });
        shots[theme].push({ t, name });
      }
    }
    const errs = await page.evaluate((n) => window.__player.errors.slice(n).map(String), before);
    if (errs.length) failed++;
    meta.push({ ...s, errors: errs });
    const esc = (x) => String(x ?? "").replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
    const sheet = `<!doctype html><html><body style="margin:0;background:#222;color:#eee;font:14px system-ui,sans-serif">
<div style="padding:6px 10px"><b>${esc(s.id)}</b> · ${esc(s.title)} · ${esc(s.takeaway)} · CTA ${esc(s.cta?.label)} → ${esc(s.cta?.href)} · ${s.duration} ms · errors ${errs.length}</div>
${themes.map((th) => `<div style="display:flex;gap:4px;padding:2px 4px">${shots[th].map((x) => `<div style="position:relative"><img src="${x.name}" style="width:470px;display:block"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 4px">${th} ${x.t}</span></div>`).join("")}</div>`).join("")}
</body></html>`;
    const sheetHtml = path.join(OUT, `sheet-${s.id}.html`);
    fs.writeFileSync(sheetHtml, sheet);
    const sp = await browser.newPage({ viewport: { width: 4 + points.length * 474, height: 400 } });
    await sp.goto(pathToFileURL(sheetHtml).href, { waitUntil: "load" });
    await sp.screenshot({ path: path.join(OUT, `sheet-${s.id}.png`), fullPage: true });
    await sp.close();
    fs.unlinkSync(sheetHtml);
    console.log(`sheet ${s.id}: ${errs.length ? "ERRORS " + JSON.stringify(errs) : "no errors"}`);
  }
  const missing = await page.evaluate(() => window.__player.missing);
  if (missing.length) { console.log("missing scene files:", missing.join(", ")); failed++; }
  if (page.consoleErrors.length) console.log("console errors:", page.consoleErrors.slice(0, 10));
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ url, themes, points, startup, chapters: meta, missing }, null, 1));
  console.log(`sheets in ${OUT}`);
} finally {
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
