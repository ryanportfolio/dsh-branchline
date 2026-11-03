// Full-resolution spot check from a fresh page load: one moment, one theme.
//
// node checks/spot.mjs --url http://127.0.0.1:4173/player.html --out <screenshots>/<project>/walkthrough/spot \
//   --name ch3-merge "scene=ch3-merge&t=6200&theme=light" [--wait 1200] [--page] [--width 1440 --height 1000]
//
// --page captures the whole viewport instead of the stage and caption (#wt-wrap).
// Prints the chapter, time, theme and any errors. Exit code 1 on errors.
import path from "node:path";
import { parseArgs, need, launch, openPlayer, outDir, withQuery } from "./lib/browser.mjs";

const args = parseArgs();
const url = need(args, "url", "player URL");
const OUT = outDir(args);
const name = need(args, "name", "file name without .png");
const query = args._[0] || "";
const browser = await launch();
let bad = false;
try {
  const page = await openPlayer(browser, withQuery(url, query), { width: +(args.width || 1440), height: +(args.height || 1000) });
  await page.waitForTimeout(+(args.wait || 1200));
  const file = path.join(OUT, name + ".png");
  if (args.page) await page.screenshot({ path: file }); else await page.locator("#wt-wrap").screenshot({ path: file });
  const info = await page.evaluate(() => ({ ...window.__player.state(), errors: window.__player.errors.slice(), missing: window.__player.missing.slice() }));
  bad = info.errors.length > 0 || page.consoleErrors.length > 0;
  console.log(file, JSON.stringify({ ...info, console: page.consoleErrors }));
} finally {
  await browser.close();
}
process.exitCode = bad ? 1 : 0;
