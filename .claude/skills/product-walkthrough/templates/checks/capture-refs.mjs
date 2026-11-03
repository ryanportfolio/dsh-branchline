// Logged-in reference captures of the real product, to compare the replica against.
//
// node checks/capture-refs.mjs --config checks/capture-refs.json --out <screenshots>/<project>/walkthrough/refs \
//   checks/steps/library.mjs [checks/steps/chat.mjs ...] [--keep-session]
//
// The test account lives in a secret file (line 1: email or username, line 2: password,
// read exactly as written),
// created with the `secret-file` skill where installed, or by hand. This script reads it, never prints it,
// and never writes it anywhere. The logged-in session is cached in the OS temp folder
// between steps and deleted at the end unless --keep-session is passed (that file holds
// a live session cookie: delete it when the work is done).
//
// A step module default-exports async ({ page, shot, base, theme }) and calls shot(name).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { parseArgs, need, launch, outDir } from "./lib/browser.mjs";

const args = parseArgs();
const cfgPath = need(args, "config", "capture-refs.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const OUT = outDir(args);
const base = cfg.baseUrl.replace(/\/$/, "");
const secretFile = cfg.secretFile.replace(/^~(?=[\\/])/, os.homedir());
const STATE = path.join(os.tmpdir(), "walkthrough-session-" + crypto.createHash("sha1").update(path.resolve(cfgPath)).digest("hex").slice(0, 10) + ".json");

const secrets = []; // the account, once read, for redacting error messages
const browser = await launch();
const context = await browser.newContext({ viewport: cfg.viewport || { width: 1440, height: 900 }, ...(fs.existsSync(STATE) ? { storageState: STATE } : {}) });
const page = await context.newPage();
const shot = async (name) => { const p = path.join(OUT, name + ".png"); await page.screenshot({ path: p }); console.log("shot", p); };
const loggedIn = () => page.evaluate((u) => fetch(u, { credentials: "include" }).then((r) => r.status).catch(() => 0), base + cfg.check.url);

async function login() {
  await page.goto(base + "/", { waitUntil: "load" });
  if ((await loggedIn()) === (cfg.check.status || 200)) { console.log("session reused"); return; }
  // The password line is kept exactly as written: spaces at either end can be part of it.
  const lines = fs.readFileSync(secretFile, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  const user = (lines[0] || "").trim(), password = lines[1] || "";
  if (!user || !password) throw new Error(`secret file needs two lines (user, password): ${secretFile}`);
  secrets.push(user, password);
  await page.goto(base + cfg.login.url, { waitUntil: "load" });
  for (const sel of cfg.login.before || []) { const el = page.locator(sel).first(); if (await el.count()) await el.click().catch(() => {}); }
  await page.locator(cfg.login.user).first().fill(user);
  await page.locator(cfg.login.password).first().fill(password);
  await page.locator(cfg.login.submit).first().click();
  await page.waitForTimeout(cfg.login.settleMs || 3000);
  const status = await loggedIn();
  console.log("login check status", status);
  if (status !== (cfg.check.status || 200)) {
    // Clear the form first: the screenshot must not show the account.
    await page.locator(cfg.login.user).first().fill("").catch(() => {});
    await page.locator(cfg.login.password).first().fill("").catch(() => {});
    await shot("login-failed");
    throw new Error("login failed; see login-failed.png");
  }
  await context.storageState({ path: STATE });
}

try {
  await login();
  for (const s of args._) {
    const mod = await import(pathToFileURL(path.resolve(s)).href + "?" + Date.now());
    await mod.default({ page, shot, base, context });
  }
} catch (e) {
  // A failed fill() quotes its value in Playwright's call log, so the account is redacted.
  console.error("ERR", secrets.reduce((m, s) => m.split(s).join("[redacted]"), String(e && e.message)));
  process.exitCode = 1;
} finally {
  await browser.close();
  if (!args["keep-session"] && fs.existsSync(STATE)) { fs.unlinkSync(STATE); console.log("session cache deleted"); }
  else if (fs.existsSync(STATE)) console.log("session cache kept at", STATE, "(live cookie: delete when done)");
}
