// Static checks before a tour ships or is embedded anywhere real. No browser needed.
//
// node checks/ship-check.mjs [--dir .] [--allow-star-origin]
//
// Fails on:
//   - parentOrigin "*" in tour.config.js (any site could frame the player, drive it and
//     read its messages); --allow-star-origin only for a local demo
//   - a chapter listed in the config without scenes/<id>.js, or a scene file whose id
//     differs from its file name (chapter order would silently fall back to `order`)
//   - a CTA href that is not a same-origin path ("/route")
//   - a scene without alt text (the stage is hidden from assistive tech; alt describes it)
//   - takeaways over 14 words, titles or takeaways missing
// Warns on reducedMotion "ignore".
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { parseArgs } from "./lib/browser.mjs";

const args = parseArgs();
const dir = path.resolve(args.dir || ".");
const problems = [], warnings = [];
// Same rule as the player's safeHref: browsers read "/\host" as "//host", so the parsed origin decides.
const sameOrigin = (h) => { if (typeof h !== "string" || !/^\/(?![\/\\])/.test(h)) return false; try { const base = "https://player.invalid/"; return new URL(h, base).origin === new URL(base).origin; } catch { return false; } };
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(dir, "tour.config.js"), "utf8"), sandbox);
const C = sandbox.window.TOUR || {};

if (!C.parentOrigin || C.parentOrigin === "*") {
  (args["allow-star-origin"] ? warnings : problems).push(`parentOrigin is "${C.parentOrigin || "*"}": set the host's exact origin (and serve the player with CSP frame-ancestors for that origin)`);
} else {
  // The player compares the string with event.origin as is, so it must already be the
  // canonical origin: lowercase host, no default port, path, query or fragment.
  let canonical = "";
  try { canonical = new URL(C.parentOrigin).origin; } catch {}
  if (canonical !== C.parentOrigin) problems.push(`parentOrigin "${C.parentOrigin}" is not written as a browser reports it${canonical && canonical !== "null" ? ` (use "${canonical}")` : ""}`);
  else if (!/^https:\/\//.test(C.parentOrigin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(C.parentOrigin)) problems.push(`parentOrigin "${C.parentOrigin}" is not an https origin like https://app.example.com`);
}
if (C.reducedMotion === "ignore") warnings.push('reducedMotion is "ignore": viewers who ask for less motion get the full animation');

// Load every scene file in a stub DOM-less context and read its registration.
for (const id of C.chapters || []) {
  const file = path.join(dir, "scenes", id + ".js");
  if (!fs.existsSync(file)) { problems.push(`chapter "${id}": scenes/${id}.js not found`); continue; }
  const box = { window: {} };
  try { vm.runInNewContext(fs.readFileSync(file, "utf8"), box); } catch (e) { problems.push(`scenes/${id}.js: does not evaluate (${e.message})`); continue; }
  const regs = box.window.SCENES || [];
  const sc = regs.find((s) => s.id === id);
  if (!sc) { problems.push(`scenes/${id}.js registers ${regs.map((s) => `"${s.id}"`).join(", ") || "nothing"}; the id must equal the file name "${id}"`); continue; }
  if (!sc.title) problems.push(`${id}: no title`);
  if (!sc.takeaway) problems.push(`${id}: no takeaway`);
  else if (sc.takeaway.trim().split(/\s+/).length > 14) problems.push(`${id}: takeaway has ${sc.takeaway.trim().split(/\s+/).length} words (max 14)`);
  if (!sc.alt) problems.push(`${id}: no alt text describing what the chapter shows`);
  const href = sc.cta && sc.cta.href;
  if (!sameOrigin(href)) problems.push(`${id}: CTA href "${href}" is not a same-origin path like /route`);
  if (!(sc.duration > 0)) problems.push(`${id}: duration missing`);
}
const total = (C.chapters || []).length;
for (const w of warnings) console.log("warn:", w);
for (const p of problems) console.log("FAIL:", p);
console.log(problems.length ? `${problems.length} problem(s) in ${total} chapter(s)` : `ship-check passed for ${total} chapter(s)`);
process.exitCode = problems.length ? 1 : 0;
