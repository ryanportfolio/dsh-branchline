#!/usr/bin/env node
/* user-walk browser driver.

   One driver = one goal = one headed Chrome, offscreen and muted. The main session
   starts it, a walker agent that has not read the code drives it, and every action
   the walker takes is logged here, so step counts come from the log and not from the
   walker's own account.

     node walk.mjs <dir> start --url <start url> [--goal "<text>"] [--known <n>]
                               [--max-actions <n>] [--skip "<regex>"] [--origin <origin>]...
                               [--storage-state <file>] [--shots <dir>] [--width 1280 --height 800]
     node walk.mjs <dir> look                  page text with refs (e12, f1e40) + viewport screenshot
     node walk.mjs <dir> click <ref>
     node walk.mjs <dir> fill <ref> <text>
     node walk.mjs <dir> fill <ref> --from-file <file>   main session: type a secret without it reaching the command line or log
     node walk.mjs <dir> select <ref> <option label>
     node walk.mjs <dir> hover <ref>
     node walk.mjs <dir> press <key>           Enter, Space, Tab (each optionally Shift+), Escape, arrows, PageUp/PageDown, Home, End
     node walk.mjs <dir> scroll <down|up> [ref]   the page (then the largest panel once the page ends), or the list or panel holding ref
     node walk.mjs <dir> back                  browser back
     node walk.mjs <dir> home                  reload the start page (counts as a backtrack)
     node walk.mjs <dir> note <text>           walker's remark: confusing label, unsure where to go
     node walk.mjs <dir> end <found|gave-up> <text>
     node walk.mjs <dir> save-state <file>     main session only: save a signed-in session for --storage-state
     node walk.mjs <dir> stop                  close the browser
     node walk.mjs <dir|run dir> summary       per-goal counts from steps.jsonl (no browser needed)
     node walk.mjs <dir> check-walker <transcript.jsonl>   list walker tool calls other than this driver and its screenshots

   Guards, enforced here and not left to the walker's judgment:
   - click, select, Enter and Space are refused when the control's text, label, title or value,
     or the control it sits in, matches the skip list; Enter in a field also checks the buttons
     of its form or nearest container (the default list covers deleting, paying, sending and
     sharing; --skip adds to it, never replaces it);
   - press takes navigation and activation keys only, so app shortcuts (Delete, letters) cannot fire;
   - landing on another origin by any route (link, redirect, form) is undone and logged as "left
     the app"; popups to other origins are blocked and closed; non-GET requests to other origins
     are aborted unless --origin allows that origin (the app's own API on another host, say);
   - a write the app redirects with 307/308 is followed here one hop at a time and stopped at the first
     hop outside the app; a redirected form submit then loads the final URL, so the page and the log show
     where the app sent it (fetch() callers, and a form that opens a new tab, still see the first URL);
   - a control must be on screen, inside any scroll box or frame it sits in, before click, hover,
     fill or select (refs cover the whole page, a person has to scroll first);
   - values typed into password, one-time-code, key and card fields, and secret-looking URL
     parameters (query and hash), are shown and logged as [redacted];
   - the local port answers only the walk.mjs client (a per-driver token in driver.json), not web pages;
   - downloads are saved to <dir>/downloads and reported only once finished or failed;
   - after --max-actions actions every command except note, end and stop is refused;
   - the server exits after 20 idle minutes so no browser is left behind.

   Packages: playwright-core in a scratch install, as ui-quality's probe does:
     npm i --no-save --prefix .tmp/user-walk-deps playwright-core@latest
*/
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, openSync, unlinkSync } from 'node:fs';

const HERE = fileURLToPath(import.meta.url);
const REPO = existsSync(join(process.cwd(), '.git')) ? process.cwd() : resolve(dirname(HERE), '../../../..');
const DEPS = join(REPO, '.tmp', 'user-walk-deps');
const INSTALL = `npm i --no-save --prefix "${DEPS}" playwright-core@latest`;

// controls a walker must never operate: deleting, paying, sending, sharing, leaving an account
const DEFAULT_SKIP = String.raw`\b(delete|remove|destroy|erase|wipe|discard|trash|empty|clear all|reset|revoke|pay|payment|purchase|buy|checkout|check out|place (your )?order|order now|complete order|book now|donate|transfer|upgrade|subscribe|unsubscribe|send|reply|invite|share|publish|post|tweet|cancel (my )?(plan|subscription|account)|close account|deactivate|leave)\b`;
const ACTIONS = new Set(['click', 'fill', 'select', 'hover', 'press', 'scroll', 'back', 'home']);
// keys a visitor uses to move and activate; anything else could fire an app shortcut, and
// Control/Meta+Enter is the usual "send" shortcut, so only Shift may go with Enter, Space or Tab
const KEYS = /^(Shift\+)?(Enter|NumpadEnter|Space| |Tab)$|^(Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageUp|PageDown|Home|End)$/;
const SECRET_PARAM = /pass|pwd|token|secret|key|code|otp|auth|session|sig|ticket|nonce/i;
const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_|_ga$|ref$)/i;
const IDLE_MS = 20 * 60 * 1000;

const [dirArg, cmd, ...rest] = process.argv.slice(2);
if (!dirArg || !cmd) {
  console.error('usage: node walk.mjs <dir> <start|look|click|fill|select|hover|press|scroll|back|home|note|end|save-state|stop|summary> ...; full list in the header comment');
  process.exitCode = 2;
} else {
  const dir = resolve(dirArg);
  if (cmd === 'start') await start(dir, rest);
  else if (cmd === '__serve') await serve(dir);
  else if (cmd === 'summary') summary(dir);
  else if (cmd === 'check-walker') checkWalker(dir, rest[0]);
  else await send(dir, cmd, rest);
}

/* ---------- walker transcript check ---------- */

// A walker must only run this driver and read its own screenshots. Its own reply is not proof,
// so read its transcript (Claude subagent .jsonl or Codex rollout .jsonl) and list anything else.
function checkWalker(dir, transcript) {
  if (!transcript || !existsSync(transcript)) {
    console.error('check-walker needs the walker transcript (.jsonl)');
    process.exitCode = 2;
    return;
  }
  const o = existsSync(join(dir, 'options.json')) ? JSON.parse(readFileSync(join(dir, 'options.json'), 'utf8')) : {};
  const norm = (p) => String(p ?? '').replace(/\\\\/g, '/').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const shots = norm(o.shots || join(dir, 'shots'));
  const goalDir = norm(dir);
  const repo = norm(REPO);
  // every tool call is split into operations; a call passes only when each of its operations does
  const calls = [];
  const ids = new Set();
  const push = (id, name, ops, text) => {
    if (id && ids.has(id)) return;
    if (id) ids.add(id);
    calls.push({ name, ops, text });
  };
  for (const line of readFileSync(transcript, 'utf8').split(/\r?\n/)) {
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    // Claude subagent transcript
    for (const c of Array.isArray(j.message?.content) ? j.message.content : []) {
      if (c.type !== 'tool_use') continue;
      const op = c.name === 'Bash' ? { kind: 'cmd', value: c.input?.command }
        : c.name === 'Read' ? { kind: 'read', value: c.input?.file_path }
        : { kind: 'other', value: c.name };
      push(c.id, c.name, [op], JSON.stringify(c.input ?? {}));
    }
    // Codex rollout: plain function calls, or a JavaScript cell that calls tools.*
    const p = j.payload;
    if (p?.type === 'function_call' || p?.type === 'custom_tool_call') {
      const text = String(p.arguments ?? p.input ?? '');
      let ops = null;
      let a;
      try {
        a = JSON.parse(text);
      } catch { /* not JSON: a JavaScript cell */ }
      if (a !== undefined) {
        // exact tool names and known keys only: a stray `cmd` on another tool, or an extra key such as
        // `shell` on exec_command, would let a call run something this check never reads
        const keys = a && typeof a === 'object' && !Array.isArray(a) ? Object.keys(a) : null;
        const only = (allowed) => keys && keys.every((k) => allowed.includes(k));
        const argv = a?.command;
        if (p.name === 'view_image' && only(['path', 'detail']) && typeof a.path === 'string') ops = [{ kind: 'read', value: a.path }];
        else if (p.name === 'exec_command' && only(['cmd', 'workdir', 'max_output_tokens', 'yield_time_ms']) && typeof a.cmd === 'string') ops = [{ kind: 'cmd', value: a.cmd }];
        else if (p.name === 'shell' && only(['command', 'workdir', 'timeout_ms']) && Array.isArray(argv) && argv.length === 3 && typeof argv[2] === 'string'
          && /^(bash|powershell(\.exe)?|pwsh(\.exe)?)$/i.test(String(argv[0]).split(/[\\/]/).pop()) && /^(-lc|-c|-Command)$/.test(argv[1])) ops = [{ kind: 'cmd', value: argv[2] }];
        else ops = [{ kind: 'other', value: p.name }];
      } else {
        ops = jsCell(text);
        if (!ops.length) ops.push({ kind: 'other', value: p.name });
      }
      push(p.call_id, p.name, ops, text);
    }
  }
  // the brief asks for exactly: node "<this driver>" "<this goal folder>" <walker command> [args], one per call
  const WALKER = new Set(['look', 'click', 'fill', 'select', 'hover', 'press', 'scroll', 'back', 'home', 'note', 'end']);
  // exactly this repo's driver (either runtime's copy); no prefix match, so "../" cannot point elsewhere
  const drivers = new Set([norm(HERE), `${repo}/.claude/skills/user-walk/scripts/walk.mjs`, `${repo}/.agents/skills/user-walk/scripts/walk.mjs`]);
  const isDriver = (p) => drivers.has(norm(p));
  const okCmd = (c) => {
    const cmd = String(c ?? '').trim();
    // the whole line, paths included, must be free of shell expansion: $(...) inside a quoted path runs too
    if (!plainArgs(cmd)) return false;
    const m = cmd.match(/^node\s+(?:"([^"]+)"|(\S+))\s+(?:"([^"]+)"|(\S+))\s+(\S+)(.*)$/s);
    if (!m) return false;
    const [, d1, d2, g1, g2, sub, rest] = m;
    if (!isDriver(d1 ?? d2) || norm(g1 ?? g2) !== goalDir || !WALKER.has(sub)) return false;
    // anywhere, quoted or not: the shell removes the quotes before the driver reads its arguments
    return !rest.includes('--from-file');
  };
  // shell operators count only outside quotes; inside double quotes both shells still expand $ and `.
  // The line must mean the same in bash (Claude, Git Bash) and PowerShell (Codex on Windows), so anything
  // the two read differently is refused: \ before a quote or a shell character (bash escapes it,
  // PowerShell keeps the \ and the quote ends the string), '' (PowerShell's escaped quote) and typographic
  // quotes (PowerShell quotes). Windows paths keep their plain backslashes.
  const plainArgs = (s) => {
    if (/[\u2018-\u201f]/.test(s) || s.includes("''")) return false;
    let q = '';
    const chars = [...s];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (q === "'") {
        if (ch === "'") q = '';
      } else if (q === '"') {
        if (ch === '\\' && chars[i + 1] === '\\') i++; // \\ ends up inside the string in both shells
        else if (ch === '\\' && '$`"'.includes(chars[i + 1] ?? '')) return false;
        else if (ch === '"') q = '';
        else if (ch === '$' || ch === '`') return false;
      } else if (ch === '\\') {
        if (!/[\w.:/\\-]/.test(chars[i + 1] ?? '')) return false;
      } else if (ch === "'" || ch === '"') q = ch;
      else if (/[;&|`$<>(){}@#\r\n]/.test(ch)) return false;
    }
    return q === '';
  };
  const okRead = (v) => {
    const n = norm(v);
    return n.startsWith(`${shots}/`) && n.endsWith('.png');
  };
  const okOp = (op) => (op.kind === 'cmd' ? okCmd(op.value) : op.kind === 'read' ? okRead(op.value) : false);
  const bad = calls.filter((c) => !c.ops.length || !c.ops.every(okOp));
  console.log(`${calls.length} tool calls, ${bad.length} outside this driver, this goal's walker commands and its screenshots`);
  for (const c of bad) {
    const why = c.ops.filter((op) => op.kind === 'other').map((op) => op.value);
    console.log(`  ${c.name}${why.length ? ` (${why.join('; ')})` : ''}: ${c.text.slice(0, 200)}`);
  }
  if (!calls.length) console.log('no tool calls found: wrong file, or a transcript format this check does not read; check by hand');
  process.exitCode = bad.length || !calls.length ? 1 : 0;
}

// A Codex JavaScript cell, read as tokens, never by pattern: it passes only when every use of `tools` is a
// direct call to exec_command or view_image whose arguments are written out as literals, and the rest of
// the cell uses nothing but the names an honest cell needs to print results. Anything else (an alias such
// as `const exec = tools.exec_command`, `tools[...]`, a command built at run time, eval, fetch) fails.
function jsCell(src) {
  const fail = (why) => [{ kind: 'other', value: `JavaScript cell: ${why}` }];
  const toks = [];
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (src.startsWith('//', i)) { const e = src.slice(i).search(/[\n\r\u2028\u2029]/); i = e < 0 ? src.length : i + e; continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); if (e < 0) return fail('unterminated comment'); i = e + 2; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      let v = '';
      let j = i + 1;
      for (;; j++) {
        if (j >= src.length) return fail('unterminated string');
        const c = src[j];
        if (c === ch) break;
        if (ch !== '`' && (c === '\n' || c === '\r')) return fail('unterminated string');
        if (ch === '`' && c === '$' && src[j + 1] === '{') return fail('a template string with ${...} cannot be checked');
        if (c !== '\\') { v += c; continue; }
        const n = src[++j];
        const hex = (len) => { const h = src.slice(j + 1, j + 1 + len); if (!/^[0-9a-f]+$/i.test(h) || h.length !== len) return null; j += len; return String.fromCodePoint(parseInt(h, 16)); };
        let d;
        if (n === undefined) return fail('unterminated string');
        // legacy octal (\73 is ";" outside strict mode): never needed, so never guessed at
        else if (/[1-9]/.test(n) || (n === '0' && /[0-9]/.test(src[j + 1] ?? ''))) return fail('octal escape in a string');
        else if (n === 'x') d = hex(2);
        else if (n === 'u' && src[j + 1] === '{') { const e = src.indexOf('}', j); const h = src.slice(j + 2, e); d = e > 0 && /^[0-9a-f]{1,6}$/i.test(h) && parseInt(h, 16) <= 0x10ffff ? String.fromCodePoint(parseInt(h, 16)) : null; if (d !== null) j = e; }
        else if (n === 'u') d = hex(4);
        else if (n === '\r') { d = ''; if (src[j + 1] === '\n') j++; }
        else d = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0', '\n': '' }[n] ?? n;
        if (d === null) return fail('bad escape in a string');
        v += d;
      }
      toks.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    const num = /^[0-9][0-9_]*(?:\.[0-9]+)?/.exec(src.slice(i));
    if (num) { toks.push({ t: 'num', v: num[0] }); i += num[0].length; continue; }
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (id) { toks.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('(){}[].,;:='.includes(ch)) { toks.push({ t: 'p', v: ch }); i++; continue; }
    return fail(`unexpected ${JSON.stringify(ch)}`);
  }
  // names a cell may use besides its own variables, for printing results and waiting on several calls at
  // once; property names (after a dot) come from their own fixed list, never from the cell's variables
  const NAMES = new Set(['await', 'const', 'let', 'var', 'text', 'console', 'Promise']);
  const PROPS = new Set(['log', 'all', 'allSettled', 'forEach', 'output', 'exit_code', 'image_url']);
  const declared = new Set();
  toks.forEach((k, n) => {
    if (k.t === 'id' && ['const', 'let', 'var'].includes(k.v) && toks[n + 1]?.t === 'id' && toks[n + 2]?.v === '=') declared.add(toks[n + 1].v);
  });
  const KEYS = { exec_command: { cmd: 'str', workdir: 'str', max_output_tokens: 'num', yield_time_ms: 'num' }, view_image: { path: 'str', detail: 'str' } };
  const ops = [];
  const is = (n, t, v) => toks[n]?.t === t && (v === undefined || toks[n].v === v);
  for (let n = 0; n < toks.length; n++) {
    const k = toks[n];
    // [ only opens an array literal; after a name, ) or ] it would read a computed property (text['constructor'])
    if (is(n, 'p', '[') && n > 0 && !'(,=[:;'.includes(toks[n - 1].t === 'p' ? toks[n - 1].v : 'x')) return fail('computed property access');
    // braces appear only around tool arguments (consumed below); a block would scope a variable that
    // shadows a global (`{ let fetch = text; } fetch(...)`) and let the global through after it
    if (is(n, 'p', '{') || is(n, 'p', '}')) return fail('a block or object outside tool arguments');
    if (k.t !== 'id') continue;
    if (is(n - 1, 'p', '.')) {
      if (PROPS.has(k.v)) continue;
      return fail(`uses .${k.v}, which a walker cell does not need`);
    }
    if (k.v === 'image') {
      // image() shows a picture to the walker: one argument, the image_url of a view_image result, never a path or URL
      let depth = 0;
      let end = n + 1;
      if (!is(end, 'p', '(')) return fail('image used other than as a call');
      for (; end < toks.length; end++) {
        if (is(end, 'p', '(') || is(end, 'p', '[') || is(end, 'p', '{')) depth++;
        else if ((is(end, 'p', ')') || is(end, 'p', ']') || is(end, 'p', '}')) && --depth === 0) break;
        else if (depth === 1 && is(end, 'p', ',')) return fail('image takes one argument');
      }
      if (!is(end - 2, 'p', '.') || !is(end - 1, 'id', 'image_url')) return fail('image shows only the image_url of a view_image result');
      continue;
    }
    if (k.v !== 'tools') {
      if (NAMES.has(k.v) || declared.has(k.v)) continue;
      return fail(`uses ${k.v}, which a walker cell does not need`);
    }
    // tools . <name> ( { key: literal, ... } )
    const tool = toks[n + 2]?.v;
    if (!is(n + 1, 'p', '.') || !is(n + 2, 'id') || !Object.hasOwn(KEYS, tool) || !is(n + 3, 'p', '(') || !is(n + 4, 'p', '{')) {
      return fail('tools used other than as a direct call to exec_command or view_image');
    }
    const args = {};
    let m = n + 5;
    while (!is(m, 'p', '}')) {
      const key = toks[m];
      if (!key || (key.t !== 'id' && key.t !== 'str') || !is(m + 1, 'p', ':')) return fail(`tools.${tool} arguments not written out literally`);
      const want = Object.hasOwn(KEYS[tool], key.v) ? KEYS[tool][key.v] : null;
      const val = toks[m + 2];
      if (!want || Object.hasOwn(args, key.v) || val?.t !== want) return fail(`tools.${tool} argument ${key.v} not allowed or not a literal`);
      args[key.v] = val.v;
      m += 3;
      if (is(m, 'p', ',')) m++;
      else if (!is(m, 'p', '}')) return fail(`tools.${tool} arguments not written out literally`);
    }
    if (!is(m + 1, 'p', ')')) return fail(`tools.${tool} takes one argument`);
    if (tool === 'exec_command') {
      if (!Object.hasOwn(args, 'cmd')) return fail('exec_command without a written-out cmd');
      ops.push({ kind: 'cmd', value: args.cmd });
    } else {
      if (!Object.hasOwn(args, 'path')) return fail('view_image without a written-out path');
      ops.push({ kind: 'read', value: args.path });
    }
    n = m + 1;
  }
  return ops;
}

/* ---------- shared ---------- */

// a hash split into its route and its parameters: "#/x?token=1" and "#access_token=1&state=2" both carry parameters
function hashParts(hash) {
  const h = hash.replace(/^#/, '');
  if (h.includes('?')) return { route: h.slice(0, h.indexOf('?')), params: new URLSearchParams(h.slice(h.indexOf('?') + 1)) };
  if (/^[^/!]*=/.test(h)) return { route: '', params: new URLSearchParams(h) };
  return { route: h, params: null };
}

const blank = (params, value) => {
  for (const k of [...params.keys()]) if (SECRET_PARAM.test(k)) params.set(k, value);
  return params;
};

// URL as logged: secret-looking parameters blanked, in the query and in the hash (OAuth puts tokens there)
function cleanUrl(url) {
  try {
    // relative links (/verify?token=...) are cleaned against a dummy base and returned relative
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
    const u = new URL(url, 'http://relative.invalid');
    blank(u.searchParams, '[redacted]');
    const { route, params } = hashParts(u.hash);
    if (params) u.hash = `${route}${route ? '?' : ''}${blank(params, '[redacted]')}`;
    return absolute ? u.href : url.startsWith('/') ? u.pathname + u.search + u.hash : u.href.replace('http://relative.invalid/', '');
  } catch {
    return url;
  }
}

// what counts as one screen: path, the query minus tracking, and the hash only when it is a route (#/ or #!)
function screenOf(url) {
  try {
    const u = new URL(url);
    const q = [...u.searchParams].filter(([k]) => !TRACKING_PARAM.test(k)).map(([k, v]) => [k, SECRET_PARAM.test(k) ? '' : v]);
    q.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = q.length ? `?${new URLSearchParams(q)}` : '';
    const { route, params } = hashParts(u.hash);
    let hash = '';
    if (/^[/!]/.test(route)) hash = `#${route}${params ? `?${blank(params, '')}` : ''}`;
    return u.origin + u.pathname + query + hash;
  } catch {
    return url;
  }
}

/* ---------- client side ---------- */

function parseStart(args) {
  const o = { origins: [], known: null, maxActions: 30, width: 1280, height: 800, skip: '' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => {
      if (i + 1 >= args.length) throw new Error(`${a} needs a value`);
      return args[++i];
    };
    if (a === '--url') o.url = next();
    else if (a === '--goal') o.goal = next();
    else if (a === '--known') o.known = Number(next());
    else if (a === '--max-actions') o.maxActions = Number(next());
    else if (a === '--skip') o.skip = next();
    else if (a === '--origin') o.origins.push(new URL(next()).origin);
    else if (a === '--storage-state') o.storageState = resolve(next());
    else if (a === '--shots') o.shots = resolve(next());
    else if (a === '--width') o.width = Number(next());
    else if (a === '--height') o.height = Number(next());
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.url) throw new Error('--url is required');
  new URL(o.url);
  if (!Number.isInteger(o.maxActions) || o.maxActions < 1) throw new Error('--max-actions must be a positive integer');
  if (o.known !== null && !(Number.isInteger(o.known) && o.known >= 0)) throw new Error('--known must be a whole number (leave it out when the site has no path)');
  for (const k of ['width', 'height']) if (!Number.isInteger(o[k]) || o[k] < 200) throw new Error(`--${k} must be a whole number of pixels, 200 or more`);
  if (o.storageState && !existsSync(o.storageState)) throw new Error(`storage state not found: ${o.storageState}`);
  if (o.skip) new RegExp(o.skip, 'i');
  return o;
}

async function start(dir, args) {
  let o;
  try {
    o = parseStart(args);
  } catch (err) {
    console.error(`start: ${err.message}`);
    process.exitCode = 2;
    return;
  }
  if (existsSync(join(dir, 'steps.jsonl')) || existsSync(join(dir, 'driver.json'))) {
    console.error(`start: ${dir} already holds a walk or a driver; use a new folder per goal`);
    process.exitCode = 2;
    return;
  }
  mkdirSync(dir, { recursive: true });
  o.shots = o.shots || join(dir, 'shots');
  mkdirSync(o.shots, { recursive: true });
  writeFileSync(join(dir, 'options.json'), JSON.stringify(o, null, 2));
  const log = openSync(join(dir, 'driver.log'), 'a');
  const child = spawn(process.execPath, [HERE, dir, '__serve'], { detached: true, stdio: ['ignore', log, log], cwd: process.cwd() });
  let exited = false;
  child.on('exit', () => (exited = true));
  child.unref();
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (existsSync(join(dir, 'driver.json'))) {
      const d = JSON.parse(readFileSync(join(dir, 'driver.json'), 'utf8'));
      if (d.error) {
        console.error(`start failed: ${d.error}`);
        unlinkSync(join(dir, 'driver.json'));
        process.exitCode = 1;
        return;
      }
      console.log(`ready: ${o.url} (via ${d.launchedVia}, max ${o.maxActions} actions)${d.note ? `; ${d.note}` : ''}`);
      return;
    }
    if (exited) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(`start: driver did not come up; see ${join(dir, 'driver.log')}`);
  process.exitCode = 1;
}

async function send(dir, command, args) {
  const file = join(dir, 'driver.json');
  if (!existsSync(file)) {
    console.error(`no driver running in ${dir}; the main session starts it`);
    process.exitCode = 1;
    return;
  }
  // the secret is read here and sent to the driver, so it never sits in a command line the session logs
  if (command === 'fill' && args[1] === '--from-file') {
    if (!args[2] || !existsSync(args[2])) {
      console.error('fill --from-file needs a readable file');
      process.exitCode = 1;
      return;
    }
    args = [args[0], readFileSync(args[2], 'utf8').replace(/\r?\n$/, '')];
    command = 'fill-secret';
  }
  const { port, token } = JSON.parse(readFileSync(file, 'utf8'));
  const body = JSON.stringify({ cmd: command, args });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-walk-token': token } });
    const out = await res.json();
    console.log(out.text);
    if (!out.ok) process.exitCode = 1;
  } catch (err) {
    console.error(`driver not reachable (${err.message}); it may have stopped`);
    process.exitCode = 1;
  }
}

/* ---------- summary ---------- */

function readSteps(dir) {
  const file = join(dir, 'steps.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}

function summarize(dir) {
  const o = existsSync(join(dir, 'options.json')) ? JSON.parse(readFileSync(join(dir, 'options.json'), 'utf8')) : {};
  const steps = readSteps(dir);
  // every attempt the budget charged counts toward actions and waste: a failed click is still a step the user took
  const attempts = steps.filter((s) => ACTIONS.has(s.action) && !s.refused);
  const startScreen = steps[0]?.screenBefore ?? (o.url ? screenOf(o.url) : '');
  const seen = new Set(startScreen ? [startScreen] : []);
  let cur = startScreen;
  let worked = false; // did anything on the current screen besides moving off it
  let backtracks = 0;
  let deadEnds = 0;
  const moveTo = (to, explicitBack) => {
    if (!to) return;
    if (to === cur) {
      if (explicitBack) backtracks++;
      return;
    }
    // a return to a screen already seen is a backtrack unless work on this screen led there (a save that lands on the list)
    const back = explicitBack || (seen.has(to) && !worked);
    if (back) {
      backtracks++;
      if (!worked && cur !== startScreen) deadEnds++;
    }
    seen.add(to);
    cur = to;
    worked = false;
  };
  for (const s of steps) {
    // the page moved after the last step was logged (slow submit, late route change, new tab)
    if (s.screenBefore && s.screenBefore !== cur) moveTo(s.screenBefore, false);
    if (!ACTIONS.has(s.action) || s.refused || s.error) continue;
    const explicitBack = s.action === 'back' || s.action === 'home';
    if (s.screenAfter && (s.screenAfter !== s.screenBefore || explicitBack)) moveTo(s.screenAfter, explicitBack);
    else if (['fill', 'select', 'press', 'click'].includes(s.action) && !s.blocked) worked = true;
  }
  const end = steps.find((s) => s.action === 'end');
  const first = steps[0]?.t;
  const last = steps.at(-1)?.t;
  const n = attempts.length;
  return {
    goal: o.goal || basename(dir),
    outcome: end ? end.arg : steps.length ? 'not ended' : 'not walked',
    endNote: end?.text || '',
    actions: n,
    known: o.known ?? null,
    wasted: o.known == null ? null : Math.max(0, n - o.known),
    backtracks,
    deadEnds,
    screens: seen.size,
    looks: steps.filter((s) => s.action === 'look').length,
    scrolls: attempts.filter((s) => s.action === 'scroll' && !s.error).length,
    failed: steps.filter((s) => s.error).length,
    refused: steps.filter((s) => s.refused || s.blocked).map((s) => `${s.action} "${s.name || s.arg || ''}": ${s.refused || s.blocked}`),
    notes: steps.filter((s) => s.action === 'note').map((s) => s.text),
    seconds: first && last ? Math.round((Date.parse(last) - Date.parse(first)) / 1000) : 0,
    dir,
  };
}

function summary(dir) {
  const isWalk = (d) => existsSync(join(d, 'steps.jsonl')) || existsSync(join(d, 'options.json'));
  const dirs = isWalk(dir)
    ? [dir]
    : (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : [])
        .filter((e) => e.isDirectory() && isWalk(join(dir, e.name)))
        .map((e) => join(dir, e.name));
  if (!dirs.length) {
    console.error(`no walk folders (options.json or steps.jsonl) in ${dir} or its subfolders`);
    process.exitCode = 1;
    return;
  }
  const rows = dirs.map(summarize);
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(rows, null, 2));
  for (const r of rows) {
    console.log(`${basename(r.dir)}: ${r.outcome}; ${r.actions} actions (known ${r.known ?? '?'}, wasted ${r.wasted ?? '?'}), ${r.backtracks} backtracks, ${r.deadEnds} dead ends, ${r.screens} screens, ${r.scrolls} scrolls, ${r.failed} failed, ${r.refused.length} refused, ${r.notes.length} notes, ${r.seconds} s`);
  }
  console.log(`written: ${join(dir, 'summary.json')}`);
}

/* ---------- server side ---------- */

function resolvePkg(spec) {
  for (const base of [join(process.cwd(), '.tmp', 'user-walk-deps'), DEPS, process.cwd(), REPO]) {
    try {
      return createRequire(join(base, 'package.json')).resolve(spec);
    } catch { /* next base */ }
  }
  return null;
}

async function launch() {
  const launcher = join(REPO, 'scripts', 'lib', 'launch-chrome.mjs');
  if (existsSync(launcher)) {
    try {
      const { launchPlacedChrome } = await import(pathToFileURL(launcher).href);
      return { browser: await launchPlacedChrome({ place: 'offscreen', purpose: 'user-walk' }), via: 'launchPlacedChrome()' };
    } catch (err) {
      console.warn(`[walk] launchPlacedChrome unavailable (${err.message}); launching directly`);
    }
  }
  const entry = resolvePkg('playwright-core') || resolvePkg('playwright');
  if (!entry) throw new Error(`playwright-core not found; run: ${INSTALL}`);
  const mod = await import(pathToFileURL(entry).href);
  const chromium = mod.chromium ?? mod.default?.chromium;
  // keep launchPlacedChrome()'s safeguard: two Autofill features make Chrome probe the Windows account
  // with a blank password on every fresh profile (failed logon events, lockout risk). Chrome keeps only the
  // last --disable-features switch, so send Playwright's own list plus those two, last.
  let own = [];
  try {
    const core = createRequire(entry).resolve('playwright-core/lib/coreBundle');
    const list = readFileSync(core, 'utf8').match(/disabledFeatures = \[([\s\S]*?)\n\s*\]/)?.[1] ?? '';
    own = [...list.replace(/\/\/.*$/gm, '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  } catch {
    console.warn("[walk] could not read Playwright's --disable-features list; only the two Autofill features are disabled");
  }
  const features = [...new Set([...own, 'AutofillAiWalletPrivatePasses', 'AutofillAmbientAutofill'])];
  const args = ['--window-position=-2400,-2400', '--mute-audio', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--disable-features=${features.join(',')}`];
  try {
    return { browser: await chromium.launch({ headless: false, channel: 'chrome', args }), via: 'installed Chrome' };
  } catch {
    // no installed Chrome: bundled Chromium, still headed
    return { browser: await chromium.launch({ headless: false, args }), via: 'bundled Chromium' };
  }
}

/* ---------- code that runs inside the page ---------- */

// every text a person could read on or around a control: its own text, label, title, value, and the
// button, link or menu item it sits in. The skip list is matched against all of it.
const NAMES = (node) => {
  const out = [];
  const add = (s) => s && out.push(String(s).replace(/\s+/g, ' ').trim().slice(0, 300));
  const own = (el) => {
    if (!el || el.nodeType !== 1) return;
    add(el.getAttribute('aria-label'));
    add(el.getAttribute('title'));
    add(el.getAttribute('alt')); // image buttons: <input type="image" alt="Delete">
    // labels resolve in the control's own document or shadow root, not the top page
    const root = el.getRootNode?.() ?? el.ownerDocument;
    for (const id of (el.getAttribute('aria-labelledby') || '').split(/\s+/)) add(id && (root.getElementById?.(id) ?? el.ownerDocument.getElementById(id))?.textContent);
    add(el.innerText ?? el.textContent);
    // what someone typed into a secret field is never collected: it would land in a refusal reason
    const secretField = el.type === 'password' || /pass|secret|token|otp|one-time|key|pin|ssn|iban|cc-|card|cvc|cvv/i.test(`${el.name || ''} ${el.id || ''} ${el.autocomplete || ''}`);
    if (!secretField && !/^(text|search|email|tel|url|number)$/i.test(el.type || '')) add(el.value);
    add(el.getAttribute('placeholder'));
    add(el.getAttribute('name'));
    for (const l of el.labels || []) add(l.textContent);
    for (const c of el.querySelectorAll('[alt], svg title, [title], [aria-label]')) add(c.getAttribute('alt') || c.getAttribute('aria-label') || c.getAttribute('title') || c.textContent);
  };
  own(node);
  own(node.closest?.('button, a, [role=button], [role=link], [role=menuitem], [role=option], [role=tab], label, summary'));
  return out.filter(Boolean);
};

// what an activation key would trigger: the focused control; for Enter also its form's submit buttons,
// or, for a field outside a form (chat boxes), the buttons in its nearest container
const KEY_NAMES = (names, withEnter) => {
  let el = document.activeElement;
  let doc = document;
  // focus can sit inside a same-origin frame or a shadow root; the outer activeElement is then only the host
  for (;;) {
    if (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    else if (el?.tagName === 'IFRAME') {
      try {
        doc = el.contentDocument;
        el = doc.activeElement;
      } catch {
        break;
      }
    } else break;
  }
  if (!el || el === doc.body) return [];
  const out = names(el);
  if (withEnter) {
    const form = el.form || el.closest('form');
    if (form) {
      for (const b of form.querySelectorAll('button, input[type=submit], input[type=image]')) if (['submit', 'image'].includes(b.type || 'submit')) out.push(...names(b));
      out.push(form.getAttribute('action') || '');
    } else if (el.matches('input, textarea, [contenteditable], [contenteditable] *')) {
      let box = el.parentElement;
      for (let i = 0; box && i < 6; i++, box = box.parentElement) {
        const buttons = box.querySelectorAll('button, [role=button], input[type=submit]');
        if (buttons.length) {
          for (const b of buttons) out.push(...names(b));
          break;
        }
      }
    }
  }
  return out.filter(Boolean);
};

// built in Node so the page needs no eval (strict Content-Security-Policy pages would block it)
const CONTROL_FN = new Function('el', `return (${NAMES})(el);`);
const KEY_FN = new Function('withEnter', `return (${KEY_NAMES})((${NAMES}), withEnter);`);

// in view inside the window and inside every scroll box it sits in; display:contents uses its children's box
const VISIBLE = (el) => {
  let r = el.getBoundingClientRect();
  if (!r.width && !r.height) {
    const range = document.createRange();
    range.selectNodeContents(el);
    r = range.getBoundingClientRect();
  }
  if (!r.width || !r.height) return false;
  let box = { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
  const cut = (c) => {
    box = { top: Math.max(box.top, c.top), left: Math.max(box.left, c.left), bottom: Math.min(box.bottom, c.bottom), right: Math.min(box.right, c.right) };
  };
  cut({ top: 0, left: 0, bottom: innerHeight, right: innerWidth });
  const up = (n) => n.parentElement || n.getRootNode?.().host || null; // cross shadow-root boundaries
  for (let p = up(el); p && p !== document.documentElement; p = up(p)) {
    const s = getComputedStyle(p);
    if (/(auto|scroll|hidden|clip)/.test(s.overflow + s.overflowX + s.overflowY)) cut(p.getBoundingClientRect());
  }
  return box.bottom - box.top > 1 && box.right - box.left > 1;
};

// blank (on) or restore (off) every secret field's value, in shadow roots and same-origin frames too
const MASK = (on) => {
  const stash = (window.__userWalkMask ??= new Map());
  if (!on) {
    for (const [el, v] of stash) el.value = v;
    stash.clear();
    return 0;
  }
  const scan = (root) => {
    for (const el of root.querySelectorAll('input, textarea')) {
      const hint = `${el.name || ''} ${el.id || ''} ${el.autocomplete || ''} ${el.getAttribute('aria-label') || ''}`;
      // fields filled with fill --from-file are secret whatever they are named
      const marked = el.ownerDocument.defaultView?.__userWalkSecret?.has(el);
      if (el.value && (marked || el.type === 'password' || /pass|secret|token|otp|one-time|key|pin|ssn|iban|cc-|card|cvc|cvv/i.test(hint))) {
        stash.set(el, el.value);
        el.value = '';
      }
    }
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) scan(host.shadowRoot);
    for (const f of root.querySelectorAll('iframe')) {
      try {
        if (f.contentDocument) scan(f.contentDocument);
      } catch { /* other-origin frame */ }
    }
  };
  scan(document);
  return stash.size;
};

// the area a wheel should turn. With an element (scroll <dir> <ref>): the nearest scroll box around it.
// Without: the page while it can still move that way, then the largest scroll box in view that can.
const SCROLLER = ({ dir, el } = {}) => {
  const se = document.scrollingElement || document.documentElement;
  const pageInfo = { x: innerWidth / 2, y: innerHeight / 2, top: Math.round(se.scrollTop), height: se.scrollHeight, view: innerHeight, page: true };
  const pageScrolls = se.scrollHeight > innerHeight + 1 && getComputedStyle(document.body).overflowY !== 'hidden';
  const canMove = (top, height, view) => (dir === 'up' ? top > 0 : dir === 'down' ? top + view < height - 1 : true);
  const boxInfo = (box) => {
    const r = box.getBoundingClientRect();
    return {
      x: (Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2,
      y: (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2,
      top: Math.round(box.scrollTop), height: box.scrollHeight, view: box.clientHeight, page: false,
    };
  };
  const scrolls = (box) => box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY);
  if (el) {
    for (let p = el; p && p !== document.documentElement && p !== document.body; p = p.parentElement || p.getRootNode?.().host) {
      if (p.nodeType === 1 && scrolls(p)) return boxInfo(p);
    }
    return pageInfo;
  }
  if (pageScrolls && canMove(pageInfo.top, pageInfo.height, pageInfo.view)) return pageInfo;
  let best = null;
  for (const box of document.querySelectorAll('body *')) {
    if (!scrolls(box) || !canMove(box.scrollTop, box.scrollHeight, box.clientHeight)) continue;
    const r = box.getBoundingClientRect();
    const area = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    if (area > (best?.area ?? 0)) best = { box, area };
  }
  return best ? boxInfo(best.box) : pageInfo;
};

async function serve(dir) {
  const o = JSON.parse(readFileSync(join(dir, 'options.json'), 'utf8'));
  const skip = new RegExp(o.skip ? `${DEFAULT_SKIP}|${o.skip}` : DEFAULT_SKIP, 'i');
  const allowed = new Set([new URL(o.url).origin, ...o.origins]);
  const stepsFile = join(dir, 'steps.jsonl');
  const blockedFile = join(dir, 'blocked.jsonl');
  const events = [];
  // every row carries the events raised since the last reply, so evidence on looks and failures is kept too
  const record = (s) => appendFileSync(stepsFile, JSON.stringify({ t: new Date().toISOString(), ...s, ...(events.length ? { events: [...events] } : {}) }) + '\n');
  const blocked = (method, url, kind) => appendFileSync(blockedFile, JSON.stringify({ t: new Date().toISOString(), method, url: cleanUrl(url), kind }) + '\n');
  const isHttp = (url) => /^https?:/.test(url);
  const inApp = (url) => {
    try {
      return allowed.has(new URL(url).origin);
    } catch {
      return false;
    }
  };

  let browser;
  let via;
  try {
    ({ browser, via } = await launch());
  } catch (err) {
    writeFileSync(join(dir, 'driver.json'), JSON.stringify({ error: err.message }));
    process.exitCode = 1;
    return;
  }

  let context;
  let page;
  let note = '';
  let starting = true;
  const downloads = new Set();
  // final responses of redirected form submits, waiting for the fresh navigation that shows them (see below)
  // keyed by the frame that submitted: only that frame's next load of the final URL gets the response
  const replay = new WeakMap();
  // each frame's newest navigation request: a redirected submit must not override one that started after it
  const latestNav = new WeakMap();
  try {
    context = await browser.newContext({
      viewport: { width: o.width, height: o.height },
      ...(o.storageState ? { storageState: o.storageState } : {}),
    });
    await context.route('**/*', async (route, req) => {
      let navFrame = null;
      try {
        navFrame = req.isNavigationRequest() ? req.frame() : null;
      } catch { /* a popup's first request has no frame yet */ }
      if (navFrame) {
        latestNav.set(navFrame, req);
        // any load in that frame ends its wait; requests carry no #fragment, so compare without it
        const waiting = replay.get(navFrame);
        replay.delete(navFrame);
        if (waiting && req.method() === 'GET' && waiting.target === req.url().split('#')[0] && Date.now() - waiting.at < 30000) {
          return route.fulfill({ response: waiting.resp });
        }
      }
      let u;
      try {
        u = new URL(req.url());
      } catch {
        return route.continue();
      }
      const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method());
      if (/^https?:$/.test(u.protocol) && allowed.has(u.origin) && write) {
        // Playwright does not route redirect hops, and a 307/308 resends the body: follow the write's
        // 307/308 chain here, one hop at a time, and stop at the first hop that points outside the app.
        // Only the final response goes back to the browser, so no hop is sent twice. A 301/302/303 turns
        // the write into a GET, which the browser follows itself (reads are allowed; landings are checked).
        // Handing the final response to the original request would leave the page at the first URL, and
        // handing the browser a redirect would let it send the next hops unchecked (Playwright does not
        // route them). So a page or frame load that was redirected is cancelled and the final URL loaded as
        // a fresh navigation, which this handler answers from `replay` without asking the app again.
        // fetch() and XHR callers still get the final response under the first URL (response.url, .redirected).
        let url = req.url();
        let resp;
        for (let hop = 0; ; hop++) {
          try {
            resp = await route.fetch({ url, maxRedirects: 0 });
          } catch (err) {
            events.push(`a request to the app failed: ${err.message.split('\n')[0]}`);
            return route.abort('failed');
          }
          const loc = resp.headers().location;
          if (![307, 308].includes(resp.status()) || !loc) break;
          let to;
          try {
            to = new URL(loc, url);
          } catch {
            break; // unreadable target: hand the response to the browser as it is
          }
          if (!/^https?:$/.test(to.protocol) || !allowed.has(to.origin)) {
            blocked(req.method(), to.href, 'write redirected to another origin');
            events.push(`blocked: a form or request was redirected, with its data, to ${to.origin === 'null' ? to.protocol : to.origin}`);
            return route.abort('blockedbyclient');
          }
          if (hop >= 10) {
            events.push('blocked: a form or request redirected more than 10 times');
            return route.abort('failed');
          }
          url = to.href;
        }
        let frame = null;
        try {
          frame = url !== req.url() && req.isNavigationRequest() ? req.frame() : null;
        } catch { /* a popup's first request has no frame yet: hand it the final response as before */ }
        if (frame) {
          await route.abort('aborted').catch(() => {});
          // the page moved on while the chain ran (a script navigation, the walker's next click): leave it there
          if (latestNav.get(frame) !== req) return;
          const target = url.split('#')[0];
          const entry = { resp, target, at: Date.now() };
          replay.set(frame, entry);
          // the same page plus a #fragment would be a jump within the page, which loads nothing: load the page
          const same = frame.url().split('#')[0] === target;
          frame.goto(same ? target : url)
            .catch(() => {}) // a download ends it early; settle() waits on the page
            .finally(() => replay.get(frame) === entry && replay.delete(frame));
          return;
        }
        return route.fulfill({ response: resp });
      }
      if (!/^https?:$/.test(u.protocol) || allowed.has(u.origin)) return route.continue();
      // while the start page loads, a script or meta-refresh redirect is the app's own (www to apex, app to sign-in)
      if (starting && req.isNavigationRequest()) return route.continue();
      let topNav = req.isNavigationRequest();
      try {
        topNav = topNav && req.frame() === req.frame().page().mainFrame();
      } catch { /* a popup's first request has no frame yet: still a top-level navigation */ }
      if (!topNav && !write) return route.continue();
      blocked(req.method(), req.url(), topNav ? 'left the app' : 'write to another origin');
      if (topNav) events.push(`blocked: the page tried to leave the app for ${u.origin}`);
      return route.abort('blockedbyclient');
    });

    const watch = (p) => {
      p.on('dialog', async (d) => {
        events.push(`browser ${d.type()} dialog: "${d.message()}" (${d.type() === 'alert' ? 'accepted' : 'dismissed'})`);
        await (d.type() === 'alert' ? d.accept() : d.dismiss()).catch(() => {});
      });
      p.on('download', (d) => {
        // keep the file and wait for it to finish: a started download is not a saved one
        const file = join(dir, 'downloads', d.suggestedFilename());
        const done = d.saveAs(file)
          .then(() => d.failure())
          .then((fail) => events.push(fail ? `a download failed: ${d.suggestedFilename()} (${fail})` : `a file downloaded and saved: ${d.suggestedFilename()} (${file})`))
          .catch((err) => events.push(`a download failed: ${d.suggestedFilename()} (${err.message.split('\n')[0]})`));
        downloads.add(done);
        done.finally(() => downloads.delete(done));
      });
    };
    page = await context.newPage();
    watch(page);
    context.on('page', async (p) => {
      watch(p);
      await p.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
      if (inApp(p.url())) {
        page = p;
        events.push(`opened a new tab: ${cleanUrl(p.url())} (now acting in it)`);
      } else {
        events.push(`a new tab to another site was blocked and closed: outside the app`);
        await p.close().catch(() => {});
      }
    });

    await page.goto(o.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((err) => events.push(`start page error: ${err.message.split('\n')[0]}`));
    await page.waitForTimeout(800);
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    starting = false;
    // a start URL that redirects (www to apex, app to its sign-in host) makes the landing origin part of the app
    if (isHttp(page.url()) && !inApp(page.url())) {
      const landed = new URL(page.url()).origin;
      allowed.add(landed);
      note = `start page redirected to ${landed}; that origin counts as part of the app`;
    }
    for (const origin of allowed) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).catch(() => {});
  } catch (err) {
    writeFileSync(join(dir, 'driver.json'), JSON.stringify({ error: err.message.split('\n')[0] }));
    await browser.close().catch(() => {});
    process.exitCode = 1;
    return;
  }

  const seen = new Set([screenOf(page.url())]);
  let refs = new Map();
  let shot = 0;
  let count = 0;
  let ended = false;

  const settle = async (before) => {
    // clicks and Enter can navigate late (slow submit, route change after a fetch); give the URL a moment to move
    if (before) await page.waitForURL((u) => u.href !== before, { timeout: 1500 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    if (downloads.size) {
      await Promise.race([Promise.allSettled([...downloads]), new Promise((r) => setTimeout(r, 20000))]);
    }
  };
  const nameOf = (ref) => refs.get(ref) ?? '';

  // null when the page cannot be read: the caller refuses instead of letting an unchecked action through
  async function controlNames(loc) {
    return loc.evaluate(CONTROL_FN).catch(() => null);
  }

  async function keyNames(withEnter) {
    return page.evaluate(KEY_FN, withEnter).catch(() => null);
  }

  async function sensitive(loc) {
    // passwords, one-time codes, keys and card fields never reach the step log
    return loc.evaluate((node) => {
      // fill on a label or wrapper lands in the control inside it; judge that control
      const el = node.control
        || (node.matches('input, textarea, select, [contenteditable]') ? node : node.querySelector('input, textarea, [contenteditable]'))
        || node;
      const hint = `${el.type || ''} ${el.name || ''} ${el.id || ''} ${el.autocomplete || ''} ${el.getAttribute('aria-label') || ''} ${node.textContent || ''}`;
      return el.type === 'password' || /pass|secret|token|otp|one-time|api.?key|\bkey\b|\bpin\b|ssn|iban|cc-|card|cvc|cvv/i.test(hint);
    }).catch(() => true);
  }

  async function onScreen(loc) {
    // a person cannot use what is not in view; refs cover the whole page, so check before acting
    const handle = await loc.elementHandle({ timeout: 3000 }).catch(() => null);
    if (!handle) return true; // let the action itself report the missing element
    if (!(await handle.evaluate(VISIBLE).catch(() => true))) return false;
    // inside a frame: the frame itself must be in view too
    const frame = await handle.ownerFrame().catch(() => null);
    const frameEl = frame && frame !== page.mainFrame() ? await frame.frameElement().catch(() => null) : null;
    if (frameEl && !(await frameEl.evaluate(VISIBLE).catch(() => true))) return false;
    return true;
  }

  async function look() {
    // the snapshot prints field values, escaped (multi-line keys, quotes), so a text replace afterwards can
    // miss them: blank secret fields in the page while the snapshot is taken, then put the values back.
    // Setting .value fires no input event, so the app's own state is untouched.
    // The screenshot is taken inside the same window: an API key or one-time code shows in plain pixels.
    const hidden = await page.evaluate(MASK, true).catch(() => 0);
    let snap;
    shot++;
    const file = join(o.shots, `${String(shot).padStart(3, '0')}.png`);
    try {
      snap = await page.locator('body').ariaSnapshot({ mode: 'ai', timeout: 10000 });
      await page.screenshot({ path: file }).catch(() => {});
    } finally {
      await page.evaluate(MASK, false).catch(() => {});
    }
    // link targets in the snapshot (/url: ...) can carry tokens: verification links, magic sign-in links
    snap = snap.replace(/^(\s*- \/url: )(.+)$/gm, (_, lead, url) => lead + cleanUrl(url.replace(/^"(.*)"$/, '$1')));
    refs = new Map();
    for (const line of snap.split('\n')) {
      const m = line.match(/^\s*- (.*?)\s*\[ref=([a-z0-9]+)\]/);
      if (!m) continue;
      let name = m[1].replace(/\s*\[(?:active|cursor=pointer|level=\d+|checked|disabled|expanded|selected|pressed)[^\]]*\]/g, '').trim();
      // the snapshot writes some lines as quoted YAML: 'button "Say \"hi\""'
      if (name.startsWith("'")) name = name.slice(1).replace(/'$/, '').replace(/''/g, "'");
      refs.set(m[2], name.replace(/\\"/g, '"'));
    }
    const pos = await page.evaluate(SCROLLER).catch(() => ({}));
    const max = 40000;
    const body = snap.length > max ? `${snap.slice(0, max)}\n... (page text cut at ${max} characters)` : snap;
    return [
      `URL: ${cleanUrl(page.url())}`,
      `Title: ${await page.title().catch(() => '')}`,
      `Screenshot of what is on screen now: ${file}`,
      `Scrolled ${pos.top ?? '?'} px of ${pos.height ?? '?'} px (${pos.page === false ? 'the main scroll area' : 'the page'}, ${pos.view ?? '?'} px in view)`,
      ...(hidden ? [`${hidden} filled password or secret field${hidden > 1 ? 's are' : ' is'} shown empty here; the value is still in the page`] : []),
      '',
      body,
    ].join('\n');
  }

  async function scroll(dir, target) {
    // the wheel turns whatever is under the mouse: move it over the area that scrolls first
    const el = target ? await target.elementHandle({ timeout: 3000 }).catch(() => null) : null;
    const s = await page.evaluate(SCROLLER, { dir, el });
    await page.mouse.move(s.x, s.y);
    await page.mouse.wheel(0, (dir === 'up' ? -1 : 1) * Math.round(s.view * 0.8));
    await page.waitForTimeout(400);
    // measure the same area again: the page, or the scroll box under the point the wheel turned
    const top = await page.evaluate(({ x, y, isPage }) => {
      const se = document.scrollingElement || document.documentElement;
      if (isPage) return se.scrollTop;
      for (let p = document.elementFromPoint(x, y); p; p = p.parentElement) {
        if (p.scrollHeight > p.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p.scrollTop;
      }
      return se.scrollTop;
    }, { x: s.x, y: s.y, isPage: s.page });
    return Math.round(top) !== s.top;
  }

  async function act(command, args, loc) {
    if (command === 'click') await loc.click({ timeout: 5000 });
    else if (command === 'hover') await loc.hover({ timeout: 5000 });
    else if (command === 'fill') await loc.fill(args.slice(1).join(' '), { timeout: 5000 });
    else if (command === 'select') await loc.selectOption({ label: args.slice(1).join(' ') }, { timeout: 5000 }).catch(() => loc.selectOption(args.slice(1).join(' '), { timeout: 5000 }));
    else if (command === 'press') await page.keyboard.press(args[0]);
    else if (command === 'scroll') return scroll(args[0], args[1] ? page.locator(`aria-ref=${args[1]}`) : null);
    else if (command === 'back') await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
    else if (command === 'home') await page.goto(o.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return true;
  }

  async function returnTo(before) {
    // undo a step that left the app: back first, then the address the walker was on
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
    if (!inApp(page.url())) await page.goto(before, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await settle();
    return inApp(page.url());
  }

  async function handle(command, args) {
    if (command === 'look') {
      const text = await look();
      seen.add(screenOf(page.url()));
      record({ action: 'look', screenBefore: screenOf(page.url()) });
      return { ok: true, text: withEvents(text) };
    }
    if (command === 'note') {
      record({ action: 'note', text: args.join(' '), screenBefore: screenOf(page.url()) });
      return { ok: true, text: 'noted' };
    }
    if (command === 'end') {
      if (ended) return { ok: false, text: 'this walk has already ended' };
      const outcome = args[0];
      if (!['found', 'gave-up'].includes(outcome)) return { ok: false, text: 'end needs found or gave-up, then a sentence' };
      ended = true;
      record({ action: 'end', arg: outcome, text: args.slice(1).join(' '), screenBefore: screenOf(page.url()) });
      return { ok: true, text: `ended: ${outcome}. Stop here; report back.` };
    }
    if (command === 'save-state') {
      // main session only: keep a test account's signed-in session for the walkers' --storage-state
      if (!args[0]) return { ok: false, text: 'save-state needs a file path' };
      await context.storageState({ path: resolve(args[0]) });
      return { ok: true, text: `saved signed-in state to ${resolve(args[0])}; keep it out of reports and commits, delete it at cleanup` };
    }
    if (command === 'stop') {
      setTimeout(() => shutdown(0), 100);
      return { ok: true, text: 'stopping' };
    }
    const secret = command === 'fill-secret';
    if (secret) command = 'fill';
    if (!ACTIONS.has(command)) return { ok: false, text: `unknown command ${command}` };
    if (ended) return { ok: false, text: 'this walk has ended' };
    if (count >= o.maxActions) return { ok: false, text: 'action budget spent: end with gave-up and say where you were looking' };
    if (command === 'press' && !KEYS.test(args[0] || '')) {
      return { ok: false, text: `press takes Enter, Space, Tab (Shift+ allowed), Escape, arrows, PageUp/PageDown, Home or End; type text with fill` };
    }

    const needsRef = ['click', 'hover', 'fill', 'select'].includes(command);
    if (needsRef && !refs.has(args[0] || '')) return { ok: false, text: `no ref ${args[0] || '(none)'} in the last look; run look and use a ref from it` };
    if (command === 'scroll') {
      if (!['up', 'down'].includes(args[0])) return { ok: false, text: 'scroll takes up or down, then optionally a ref inside the list or panel to scroll' };
      if (args[1] && !refs.has(args[1])) return { ok: false, text: `no ref ${args[1]} in the last look; run look and use a ref from it` };
    }
    if (secret) {
      // remember the field, so later looks keep it masked whatever it is named
      await page.locator(`aria-ref=${args[0]}`).evaluate((node) => {
        const el = node.control || (node.matches('input, textarea') ? node : node.querySelector('input, textarea')) || node;
        (window.__userWalkSecret ??= new WeakSet()).add(el);
      }).catch(() => {});
    }
    const before = page.url();
    seen.add(screenOf(before));
    const name = needsRef ? nameOf(args[0]) : '';
    const loc = needsRef ? page.locator(`aria-ref=${args[0]}`) : null;
    if (loc && !(await onScreen(loc))) {
      return { ok: false, text: `${name || args[0]} is not on screen; scroll to it first (refs list the whole page, as a screen reader would)` };
    }
    let arg = command === 'fill' || command === 'select' ? args.slice(1).join(' ') : args[0];
    if (command === 'fill' && (secret || (await sensitive(loc)))) arg = '[redacted]';
    const base = { action: command, ref: args[0], name, arg, screenBefore: screenOf(before) };

    let targets = [];
    if (command === 'click' || command === 'select') {
      const names = await controlNames(loc);
      targets = names && [name, ...(command === 'select' ? [args.slice(1).join(' ')] : []), ...names];
    }
    const key = command === 'press' ? String(args[0]).split('+').pop() : '';
    if (/^(Enter|NumpadEnter)$/.test(key)) targets = await keyNames(true);
    else if (key === 'Space' || key === ' ') targets = await keyNames(false);
    if (!targets) {
      record({ ...base, refused: 'could not read the control to check it against the skip list' });
      return { ok: false, text: 'refused: could not read this control to check it is safe; run look and try another way' };
    }
    const hit = targets.find((t) => skip.test(t));
    if (hit) {
      // report the matched word only: the full text can hold what someone typed
      const word = hit.match(skip)[0];
      record({ ...base, refused: `on the skip list (${word})` });
      return { ok: false, text: `refused: this control matches "${word}" on the skip list. Do not try to work around this.` };
    }

    count++;
    let moved = true;
    try {
      moved = await act(command, args, loc);
      await settle(['click', 'press', 'select'].includes(command) ? before : undefined);
    } catch (err) {
      record({ ...base, error: err.message.split('\n')[0] });
      return { ok: false, text: withEvents(`that did not work: ${err.message.split('\n')[0]}`) };
    }
    // any route off the app (link, redirect, form post) is undone, not just ones the router aborted
    if (page.url().startsWith('chrome-error://') || (isHttp(page.url()) && !inApp(page.url()))) {
      if (!page.url().startsWith('chrome-error://')) {
        blocked('GET', page.url(), 'left the app');
        events.push(`blocked: the page went to another site (${new URL(page.url()).origin})`);
      }
      const ok = await returnTo(before);
      record({ ...base, blocked: 'leaves the app', screenAfter: screenOf(page.url()) });
      return {
        ok: false,
        text: withEvents(ok
          ? `refused: that goes to another site, outside this app. You are back on ${cleanUrl(page.url())}.`
          : `refused: that goes to another site, and the way back failed; you are on ${cleanUrl(page.url())}. Try home.`),
      };
    }
    const after = page.url();
    const sb = screenOf(before);
    const sa = screenOf(after);
    const revisit = sa !== sb && seen.has(sa);
    seen.add(sa);
    record({ ...base, screenAfter: sa, revisit, urlAfter: cleanUrl(after) });
    const where = sa === sb ? 'same screen' : `${revisit ? 'back on a screen you saw before' : 'new screen'}: ${cleanUrl(after)}`;
    const stuck = command === 'scroll' && !moved ? ' Nothing moved: this area is at its end or does not scroll.' : '';
    return { ok: true, text: withEvents(`ok (${count} actions so far): ${command}${name ? ` ${name}` : ''} → ${where}.${stuck} Run look to see the page.`) };
  }

  function withEvents(text) {
    if (!events.length) return text;
    const out = `${events.join('\n')}\n${text}`;
    events.length = 0;
    return out;
  }

  let idle;
  const touch = () => {
    clearTimeout(idle);
    idle = setTimeout(() => shutdown(0), IDLE_MS);
  };
  async function shutdown(code) {
    await browser.close().catch(() => {});
    server.close();
    process.exitCode = code;
  }

  let queue = Promise.resolve();
  // only the walk.mjs client may drive this browser: a web page that finds the port cannot send the
  // custom header without a CORS preflight, which this server never answers
  const token = randomUUID();
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.headers['x-walk-token'] !== token || !/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) {
      res.writeHead(403);
      res.end();
      return;
    }
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      touch();
      queue = queue.then(async () => {
        let out;
        try {
          const { cmd: c, args = [] } = JSON.parse(data || '{}');
          out = await handle(c, args);
        } catch (err) {
          out = { ok: false, text: `driver error: ${err.message.split('\n')[0]}` };
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(out));
      });
    });
  });
  server.listen(0, '127.0.0.1', () => {
    writeFileSync(join(dir, 'driver.json'), JSON.stringify({ port: server.address().port, token, pid: process.pid, launchedVia: via, ...(note ? { note } : {}) }));
    touch();
  });
  browser.on('disconnected', () => {
    server.close();
    clearTimeout(idle);
  });
}
