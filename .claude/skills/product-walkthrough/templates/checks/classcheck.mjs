// Lists classes the scenes use that have no rule in the product CSS (or in <style>
// blocks inside the scene files). A missing class means the replica renders differently from the
// product: the CSS chunk was not copied, the class was invented, or the product itself
// uses a class its build purged (report that one to the owner as a product bug).
//
// node checks/classcheck.mjs --css app.css [--css chunk-settings.css] [--ignore group,peer,wtx-] scenes [scenes/ch2.js ...]
//
// Arguments are scene files or folders of them. --ignore takes class prefixes that are
// hooks or markers with no rule by design (Tailwind's group and peer, the scene's own ids).
// Exit code 1 when anything is missing.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, need } from "./lib/browser.mjs";

const args = parseArgs();
const cssFiles = [].concat(need(args, "css", "product stylesheet"));
const ignore = ["group", "peer", ...String(args.ignore || "").split(",").filter(Boolean)];
const files = [];
for (const a of args._.length ? args._ : ["scenes"]) {
  const st = fs.statSync(a);
  if (st.isDirectory()) for (const f of fs.readdirSync(a)) { if (f.endsWith(".js")) files.push(path.join(a, f)); }
  else files.push(a);
}
const sources = files.map((f) => [f, fs.readFileSync(f, "utf8")]);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Each scene is checked against the product CSS plus its own <style> blocks only: the
// player removes a scene's markup, styles included, before mounting the next, and a class
// named in a querySelector string never counts as a rule. A block written as
// <style>${css}</style> brings in the template string that `css` names in the same file.
const named = (s, id) => (new RegExp(`\\b(?:const|let|var)\\s+${reEsc(id)}\\s*=\\s*\`([^\`]*)\``).exec(s) || [])[1] || "";
const stylesOf = (s) => [...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].flatMap((m) =>
  [m[1], ...[...m[1].matchAll(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g)].map((v) => named(s, v[1]))]);
const productCss = cssFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
// A class starting with a digit (Tailwind's 2xl:) is written `.\32 xl\:grid` in CSS;
// minifiers may drop the space when the next character is not a hex digit.
const selector = (c) => {
  const body = (s) => reEsc(s.replace(/([^a-zA-Z0-9_-])/g, "\\$1"));
  const m = /^(-?)(\d)(.*)$/.exec(c);
  return "\\." + (m ? `${reEsc(m[1])}\\\\3${m[2]} ?${body(m[3])}` : body(c));
};
const has = (c, haystack) => new RegExp(selector(c) + "(?![a-zA-Z0-9_-]|\\\\)").test(haystack);

let total = 0;
for (const [file, raw] of sources) {
  const haystack = productCss + "\n" + stylesOf(raw).join("\n");
  // Blank out simple ${...} expressions (no nested template) so quotes inside them
  // cannot end a class="..." early; nested templates stay and get scanned themselves.
  const src = raw.replace(/\$\{[^{}`]*\}/g, " ");
  const used = new Set();
  const add = (s) => s.replace(/\$\{[^}]*\}/g, " ").split(/\s+/).forEach((c) => c && used.add(c));
  for (const m of src.matchAll(/class="([^"]*)"/g)) add(m[1]);
  for (const m of src.matchAll(/class='([^']*)'/g)) add(m[1]);
  for (const m of src.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)) for (const s of m[1].matchAll(/["'`]([^"'`]+)["'`]/g)) add(s[1]);
  const missing = [...used].filter((c) => !ignore.some((p) => c === p || c.startsWith(p + "/") || (p.endsWith("-") && c.startsWith(p))) && !has(c, haystack)).sort();
  total += missing.length;
  console.log(`${file}: ${missing.length ? `${missing.length} without a rule\n  ${missing.join("\n  ")}` : "all classes found"}`);
}
process.exitCode = total ? 1 : 0;
