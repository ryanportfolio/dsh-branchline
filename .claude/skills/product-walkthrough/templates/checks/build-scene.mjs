// Builds a scene file from a source template by inlining real assets: icon SVG markup
// from the product's lucide icon package and small files (logos, avatars) as data URIs.
//
// node checks/build-scene.mjs --src checks/src/ch3-merge.src.js --out scenes/ch3-merge.js \
//   --lucide <repo>/node_modules/lucide-react/dist/esm/icons --icons check,chevron-down,send \
//   [--asset acme-logo=<repo>/client/src/assets/logo.svg ...]
//
// The source must contain the marker  /*__ASSETS__*/null  where it wants the object
// { icons: { name: "<path .../>" }, assets: { key: "data:..." } }.
// --print with --lucide and --icons prints the icon markup as JSON instead of building.
//
// For other icon sets, copy each SVG's inner markup from the package the product imports.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, need } from "./lib/browser.mjs";

const args = parseArgs();
const icons = {};
if (args.icons) {
  const dir = need(args, "lucide", "folder of lucide icon modules");
  for (const name of String(args.icons).split(",").filter(Boolean)) {
    const src = fs.readFileSync(path.join(dir, name + ".js"), "utf8");
    // lucide-react >= 0.4xx: const __iconNode = [...];  older: createLucideIcon("Name", [...])
    const m = src.match(/const __iconNode = (\[[\s\S]*?\]);\r?\n/) || src.match(/createLucideIcon\(\s*["'][^"']+["'],\s*(\[[\s\S]*?\])\s*\)/);
    if (!m) throw new Error("no icon node in " + name);
    const nodes = new Function("return " + m[1])();
    icons[name] = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  }
}
if (args.print) { console.log(JSON.stringify(icons, null, 1)); process.exit(0); }

const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2" };
const assets = {};
for (const spec of [].concat(args.asset || [])) {
  const i = spec.indexOf("=");
  const key = spec.slice(0, i), file = spec.slice(i + 1);
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error("unknown file type: " + file);
  assets[key] = `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

const srcFile = need(args, "src", "scene source with /*__ASSETS__*/null"), outFile = need(args, "out", "scene file to write");
const tpl = fs.readFileSync(srcFile, "utf8");
if (!tpl.includes("/*__ASSETS__*/null")) throw new Error("marker /*__ASSETS__*/null not found in " + srcFile);
// Function replacement: a string replacement would expand "$&" and friends inside the JSON.
const out = tpl.replace("/*__ASSETS__*/null", () => JSON.stringify({ icons, assets }));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
console.log(`wrote ${outFile} (${(out.length / 1024).toFixed(0)} KB, ${Object.keys(icons).length} icons, ${Object.keys(assets).length} assets)`);
