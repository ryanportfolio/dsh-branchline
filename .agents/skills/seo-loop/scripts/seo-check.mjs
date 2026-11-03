#!/usr/bin/env node
/* seo-loop classic check: crawl a running site and report the SEO faults that
   keep pages out of the index or split them across URLs.

   Reads raw HTML only, the way a crawler sees it on the first fetch. It does not
   run JavaScript, so tags a framework adds in the browser are invisible here;
   Google renders pages later, but canonical, noindex and hreflang belong in the
   server's HTML. Zero dependencies, Node 20 or newer.

     node seo-check.mjs <url> [--out report.json] [--max-pages 200] [--urls list.txt | --include list.txt] [--delay ms] [--public-origin https://example.com]
     node seo-check.mjs diff <before.json> <after.json>

   Check mode crawls internal links breadth-first from <url>, then fetches the
   sitemap URLs it has not seen, until --max-pages HTML fetches. --urls checks
   the start URL and the listed URLs (one per line) plus robots.txt and the
   sitemap; --include crawls as usual and also fetches the listed URLs. URLs
   robots.txt disallows for Googlebot are reported, not fetched, and so are
   redirects into them. Nothing outside the audited origin is fetched, except
   robots.txt redirects, which Google follows across origins. Sitemaps may be
   XML (urlset, sitemap index, RSS, Atom), text or gzip.

   --public-origin: when <url> is a local preview of a site whose canonical,
   hreflang, sitemap and link URLs name the production origin, those URLs are
   read as the same paths on the preview. Without it, a local run is reported
   incomplete when robots.txt, a sitemap or a canonical names another origin,
   when the start page links only to one other origin, or when the start URL
   redirects off the machine.

   Exit codes, check mode: 0 no fail findings, 1 fail findings, 2 incomplete
   (start page not read as HTML with HTTP 200, or a local run that needs
   --public-origin). Diff mode takes two seo-check reports or two willaicite
   (geo-audit --json) reports: 0 nothing new, 1 a regression (a new fail or warn
   finding, a warn that became a fail, a duplicate group that grew, an indexable
   page lost, or a lower willaicite dimension score), 2 the inputs can't be
   compared (different tools, script versions, requested URLs or landing
   origins, an incomplete run, a later run that hit its page budget when the
   earlier did not, a
   finding that vanished without the later run rechecking it, or a page the
   earlier run found indexable that the later run did not check). A confirmed
   regression exits 1 even when other findings can't be compared. Info findings
   are left out of the comparison.

   Finding ids are stable across runs (rule plus URL or duplicate key), so diff
   can say which findings a round fixed and which it introduced. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';

const UA = 'Mozilla/5.0 (compatible; seo-check/1; +https://github.com/ryanportfolio/Harness-Firmware)';
const MAX_BYTES = 15 * 1024 * 1024; // HTML pages: Google reads the first 15 MB and ignores the rest
const SITEMAP_MAX_BYTES = 50 * 1024 * 1024; // Google's limit for one uncompressed sitemap
const SITEMAP_MAX_URLS = 50_000;
const ROBOTS_MAX_BYTES = 500 * 1024; // Google ignores robots.txt content past 500 KiB
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 10;
const ROBOTS_MAX_REDIRECTS = 5; // RFC 9309: follow at least five; past that, treat robots.txt as missing
const MAX_SITEMAP_FILES = 50;
const TITLE_DISPLAY_CHARS = 70;
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|m?js|json|xml|txt|zip|gz|mp4|webm|mov|mp3|wav|ogg|woff2?|ttf|otf|eot)$/i;
// Google supports only ISO 639-1 languages and ISO 3166-1 alpha-2 regions (so not eng, es-419, en-UK),
// plus an optional ISO 15924 script (zh-Hant). Script codes are checked for shape only.
const ISO_639_1 = new Set('aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(' '));
const ISO_3166_1 = new Set('ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw'.split(' '));
const validHreflang = (value) => {
  const v = value.toLowerCase();
  if (v === 'x-default') return true;
  const m = /^([a-z]{2})(?:-([a-z]{4}))?(?:-([a-z]{2}))?$/.exec(v);
  return Boolean(m) && ISO_639_1.has(m[1]) && (!m[3] || ISO_3166_1.has(m[3]));
};

function usage() {
  return 'usage:\n  node seo-check.mjs <url> [--out report.json] [--max-pages 200] [--urls list.txt | --include list.txt] [--delay ms] [--public-origin https://example.com]\n  node seo-check.mjs diff <before.json> <after.json>\n';
}

// ---------- fetching ----------

/** Read at most `max` bytes, then cancel, so a huge response never lands in memory whole. */
async function readCapped(res, max) {
  const reader = res.body?.getReader();
  if (!reader) return { bytes: Buffer.alloc(0), truncated: false };
  const chunks = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    if (size > max) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return { bytes: Buffer.concat(chunks).subarray(0, max), truncated };
}

const decodeUtf8 = (bytes) => new TextDecoder('utf-8', { fatal: false }).decode(bytes);

/** Pages decode the way browsers pick an encoding: a byte order mark, then a known Content-Type
    charset, then the prescan of the first 1024 bytes (a <meta charset>, or http-equiv content-type
    with a charset, outside comments; else an <?xml encoding>), else UTF-8. A prescan that finds
    UTF-16 means UTF-8 (the bytes that held it were ASCII), and x-user-defined means windows-1252. */
const encodingOf = (label) => { try { return label ? new TextDecoder(label.trim()).encoding : null; } catch { return null; } };
function prescanEncoding(bytes) {
  const start = bytes.subarray(0, 1024).toString('latin1');
  let found = null;
  // Comments, tags and bogus comments read whole, so a <meta> inside a quoted attribute value is not one.
  for (const m of start.matchAll(new RegExp(`<!--[\\s\\S]*?(?:-->|$)|${TAG}|<[!/?][^>]*(?:>|$)`, 'g'))) {
    if (m[1] || m[2]?.toLowerCase() !== 'meta') continue;
    const a = attrs(m[3]);
    const content = (a['http-equiv'] ?? '').trim().toLowerCase() === 'content-type' ? a.content : undefined;
    found = encodingOf(a.charset ?? /charset\s*=\s*["']?([^\s;"']+)/i.exec(content ?? '')?.[1]);
    if (found) break;
  }
  found ??= encodingOf(/^<\?xml[^>]*?\sencoding\s*=\s*["']([^"'>]+)/.exec(start)?.[1]);
  return found?.startsWith('utf-16') ? 'utf-8' : found === 'x-user-defined' ? 'windows-1252' : found;
}
function decodePage(bytes, type) {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 'utf-8'
    : bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : null;
  const label = bom ?? encodingOf(/charset\s*=\s*["']?([^\s;"']+)/i.exec(type)?.[1]) ?? prescanEncoding(bytes) ?? 'utf-8';
  return new TextDecoder(label).decode(bytes);
}

/** Pages: the body is read for HTML, XML and text responses, and for responses with no
    content type (sniffed later). Files (robots.txt, sitemaps): read whatever the content
    type, since Google reads them by URL, not by type. */
async function fetchOnce(url, { file = false, max = MAX_BYTES } = {}) {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5' },
    });
    const headers = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    const type = headers['content-type'] ?? '';
    let body = null, bytes = null, truncated = false;
    if (res.status >= 200 && res.status < 300 && (file || !type || /html|xml|text\/plain/i.test(type))) {
      ({ bytes, truncated } = await readCapped(res, max));
      body = file ? decodeUtf8(bytes) : decodePage(bytes, type);
    } else {
      await res.body?.cancel().catch(() => undefined);
    }
    return { status: res.status, headers, body, bytes, truncated, error: null };
  } catch (err) {
    const msg = err?.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS} ms` : (err?.cause?.code ?? err?.message ?? String(err));
    return { status: null, headers: {}, body: null, bytes: null, truncated: false, error: msg };
  }
}

/** Follow redirects by hand so the chain is visible. `rewrite(next)` maps a hop
    before it is checked (production origin -> preview). `guard(next)` returns a
    reason to stop before fetching a hop (robots.txt, another origin), or null;
    the stopped hop stays in the chain with status null. A fragment in a Location
    is dropped: it never reaches the server. */
async function fetchChain(url, guard = () => null, rewrite = (u) => u, { maxRedirects = MAX_REDIRECTS, ...fetchOpts } = {}) {
  const chain = [];
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetchOnce(current, fetchOpts);
    chain.push({ url: current, status: res.status });
    const loc = res.headers.location;
    if ([301, 302, 303, 307, 308].includes(res.status) && !loc) return { ...res, body: null, chain, finalUrl: current, error: `HTTP ${res.status} redirect without a Location header` };
    if (res.status >= 300 && res.status < 400 && loc) {
      let next;
      try { const u = new URL(loc, current); u.hash = ''; next = rewrite(u.href); } catch { return { ...res, chain, finalUrl: current, error: `bad Location header: ${loc}` }; }
      if (chain.some((c) => c.url === next)) return { ...res, chain, finalUrl: next, error: 'redirect loop' };
      const stop = await guard(next);
      if (stop) return { ...res, body: null, chain: [...chain, { url: next, status: null }], finalUrl: next, error: null, stopped: stop };
      current = next;
      continue;
    }
    return { ...res, chain, finalUrl: current };
  }
  return { status: null, headers: {}, body: null, chain, finalUrl: current, error: `more than ${maxRedirects} redirects` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- robots.txt (Google's rules: most specific group, longest match, allow wins ties) ----------

// Key spellings Google's parser (github.com/google/robotstxt) accepts besides the standard ones.
const ROBOTS_KEYS = {
  'user-agent': 'user-agent', useragent: 'user-agent', 'user agent': 'user-agent',
  allow: 'allow',
  disallow: 'disallow', dissallow: 'disallow', dissalow: 'disallow', disalow: 'disallow', diasllow: 'disallow', disallaw: 'disallow',
  sitemap: 'sitemap', 'site-map': 'sitemap',
};

function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let group = null;
  let lastWasAgent = false;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    // "key: value"; Google also accepts "key value" when the line has exactly two tokens.
    const colon = line.indexOf(':');
    const name = colon > 0 ? line.slice(0, colon).trimEnd() : '';
    const m = /^[a-z][a-z -]*$/i.test(name) ? [line, name, line.slice(colon + 1)] : line.match(/^([a-z-]+)\s+(\S+)$/i);
    if (!m) continue;
    const key = ROBOTS_KEYS[m[1].toLowerCase().replace(/\s+/g, ' ')];
    const value = m[2].trim();
    if (!key) continue;
    if (key === 'sitemap') { if (value) sitemaps.push(value); continue; }
    if (key === 'user-agent') {
      if (!lastWasAgent || !group) { group = { agents: [], rules: [] }; groups.push(group); }
      // Google matches the product token only: "Googlebot/2.1" is googlebot, "* foo" is *.
      const agent = value.startsWith('*') ? '*' : (value.toLowerCase().match(/^[a-z_-]+/)?.[0] ?? '');
      if (agent) group.agents.push(agent);
      lastWasAgent = true;
      continue;
    }
    // Only a rule line ends a run of user-agent lines (Crawl-delay and unknown keys do not).
    lastWasAgent = false;
    if (!group || !value) continue;
    group.rules.push({ allow: key === 'allow', pattern: value });
    // Google: "Allow: /dir/index.htm..." also allows the directory itself (/dir/).
    const slash = value.lastIndexOf('/');
    if (key === 'allow' && slash >= 0 && value.startsWith('/index.htm', slash)) group.rules.push({ allow: true, pattern: `${value.slice(0, slash + 1)}$` });
  }
  return { groups, sitemaps };
}

function rulesFor(robots, agent) {
  const exact = robots.groups.filter((g) => g.agents.includes(agent));
  const chosen = exact.length ? exact : robots.groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

/** Rules and URL paths compare in one form: non-ASCII and spaces percent-encoded
    as UTF-8, existing escapes upper-cased. `Disallow: /café` then matches `/caf%C3%A9`. */
const encodeForMatch = (s) => s
  .replace(/[^\x21-\x7e]/gu, (c) => encodeURIComponent(c))
  .replace(/%[0-9a-f]{2}/gi, (e) => {
    // An escaped unreserved character is the character itself (/priv%61te = /private).
    const c = String.fromCharCode(parseInt(e.slice(1), 16));
    return /[A-Za-z0-9\-._~]/.test(c) ? c : e.toUpperCase();
  });

function patternMatches(pattern, path) {
  // Only a final $ anchors; a $ elsewhere is a literal character. Without a regex: the first
  // piece is a prefix and each later piece is found leftmost after the one before, which is
  // exact for '*' wildcards and linear in the path, however many wildcards there are.
  const anchored = pattern.endsWith('$');
  const pieces = (anchored ? pattern.slice(0, -1) : pattern).split('*');
  if (!path.startsWith(pieces[0])) return false;
  let pos = pieces[0].length;
  if (pieces.length === 1) return !anchored || pos === path.length;
  for (const piece of pieces.slice(1, -1)) {
    const at = path.indexOf(piece, pos);
    if (at < 0) return false;
    pos = at + piece.length;
  }
  const last = pieces.at(-1);
  return anchored ? path.length - last.length >= pos && path.endsWith(last) : path.indexOf(last, pos) >= 0;
}

// Robots directives from meta robots or X-Robots-Tag, comma separated, one line per meta tag (all
// X-Robots-Tag headers arrive as one line).
// "googlebot: noindex" carries a user-agent prefix; a directive for another crawler (bingbot,
// googlebot-news) doesn't apply to Google web search. The prefix covers only its own directive:
// fetch joins repeated X-Robots-Tag headers with ", ", so "bingbot: nofollow" and a separate
// "noindex" header arrive as one list, and a bare noindex has to count for Google. max-snippet,
// max-image-preview, max-video-preview and unavailable_after carry values. A past unavailable_after
// date keeps the page out of results, so it counts as noindex.
const VALUE_DIRECTIVES = new Set(['max-snippet', 'max-image-preview', 'max-video-preview', 'unavailable_after']);
// A piece that starts the next directive: "name:" or a bare word (noindex, noai, noodp). The pieces
// of a date hold digits or spaces.
const DIRECTIVE_START = /^(?:[a-z0-9_-]+\s*:|[a-z][a-z_-]*\s*$)/;
function hasNoindex(directives, now = Date.now()) {
  return directives.split('\n').some((line) => {
    const parts = line.split(',');
    for (let i = 0; i < parts.length; i++) {
      let d = parts[i].trim().toLowerCase();
      const prefixed = /^([a-z0-9_-]+)\s*:\s*(.*)$/.exec(d);
      if (prefixed && !VALUE_DIRECTIVES.has(prefixed[1])) {
        if (prefixed[1] !== 'googlebot') continue;
        d = prefixed[2];
      }
      if (d === 'noindex' || d === 'none') return true;
      const until = /^unavailable_after\s*:\s*(.+)$/.exec(d);
      if (!until) continue;
      // A date may hold commas ("Wed, 03 Dec 2025 13:09:53 GMT"): it runs to the next directive.
      let value = until[1];
      while (i + 1 < parts.length && !DIRECTIVE_START.test(parts[i + 1].trim().toLowerCase())) value += `,${parts[++i]}`;
      // Only a date with its year counts: V8 reads "Dec 3" as 2001.
      if (!/\b\d{4}\b|\b\d{1,2}-[a-z]{3}-\d{2}\b/i.test(value)) continue;
      const t = Date.parse(value);
      if (!Number.isNaN(t) && t < now) return true;
    }
    return false;
  });
}

function googlebotAllowed(robots, url) {
  if (!robots) return true;
  const u = new URL(url);
  if (u.pathname === '/robots.txt') return true;
  // Built once per robots.txt: the googlebot rules encoded and grouped by the literal text before
  // their first '*' (a final $ dropped), which a matching path must start with. A path then tests
  // only the groups its own prefixes name, so many rules times many URLs stays cheap.
  if (!robots.googlebot) {
    const byPrefix = new Map();
    for (const r of rulesFor(robots, 'googlebot')) {
      const pattern = encodeForMatch(r.pattern);
      const star = pattern.indexOf('*');
      const prefix = star >= 0 ? pattern.slice(0, star) : pattern.replace(/\$$/, '');
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix).push({ allow: r.allow, pattern });
    }
    robots.googlebot = { byPrefix, lengths: [...new Set([...byPrefix.keys()].map((p) => p.length))], answers: new Map() };
  }
  const path = encodeForMatch(u.pathname + u.search);
  const known = robots.googlebot.answers.get(path);
  if (known !== undefined) return known;
  let best = null;
  for (const n of robots.googlebot.lengths) {
    if (n > path.length) continue;
    for (const rule of robots.googlebot.byPrefix.get(path.slice(0, n)) ?? []) {
      if (!patternMatches(rule.pattern, path)) continue;
      const len = rule.pattern.length;
      if (!best || len > best.len || (len === best.len && rule.allow)) best = { allow: rule.allow, len };
    }
  }
  const allowed = best ? best.allow : true;
  robots.googlebot.answers.set(path, allowed);
  return allowed;
}

// ---------- sitemap ----------

// Sitemap elements may carry a namespace prefix (<sm:urlset xmlns:sm="...">).
const NS = '(?:[A-Za-z_][\\w.-]*:)?';
// Comments, CDATA, processing instructions and DOCTYPE. Each one left open runs to the end of the
// input, so a malformed file is read in one pass: a scan that failed would restart at every later '<'.
const XML_NON_ELEMENTS = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<\?[\s\S]*?(?:\?>|$)|<!DOCTYPE[^>]*(?:>|$)/gi;
const closes = (m) => (m.startsWith('<!--') ? m.endsWith('-->') : m.startsWith('<![') ? m.endsWith(']]>') : m.startsWith('<?') ? m.endsWith('?>') : m.endsWith('>'));
// The root element's local name: the first element after the prolog (declaration, comments, DOCTYPE).
const xmlRoot = (xml) => /<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)/.exec(xml.replace(XML_NON_ELEMENTS, ' '))?.[1].toLowerCase() ?? null;
// XML well-formedness without a parser: only the five predefined entities or character references
// (sitemaps carry no DTD), no stray '<', properly nested tags, one root element and nothing after it.
function xmlSyntaxOk(xml) {
  let open = false;
  const body = xml.replace(XML_NON_ELEMENTS, (m) => { if (!closes(m)) open = true; return ' '; });
  if (open) return false; // a comment, CDATA section, declaration or DOCTYPE that never closes
  if (/&(?!(?:lt|gt|amp|quot|apos|#\d+|#x[\da-f]+);)/i.test(body)) return false;
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|</g;
  const stack = [];
  let start = -1, end = -1;
  for (let m; (m = tag.exec(body));) {
    if (!m[2] || end >= 0) return false; // a stray '<', or markup after the root element
    if (start < 0) start = m.index;
    if (m[1]) { if (m[3] || m[4] || stack.pop() !== m[2]) return false; }
    else if (!m[4]) stack.push(m[2]);
    if (!stack.length) end = m.index + m[0].length;
  }
  return end >= 0 && !/\S/.test(body.slice(0, start) + body.slice(end));
}
const httpUrl = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Comments removed and CDATA turned into escaped text, so neither can be mistaken for entries.
const escapeXml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const prepareXml = (xml) => xml.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ').replace(/<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)/g, (_, t) => escapeXml(t));

/** Entries (<url>, <sitemap>, <item>, <entry>) in one linear pass over their open and close tags.
    `bad` = an entry that never closes, nests, or self-closes. */
function xmlEntries(prepared, entry) {
  // A tag left open runs to the end of the input (and leaves its entry unclosed).
  const re = new RegExp(`<(/?)(${NS})${entry}(?=[\\s/>])[^>]*?(/?)(?:>|$)`, 'gi');
  const entries = [];
  let open = null, opened = 0, bad = false;
  for (const m of prepared.matchAll(re)) {
    if (m[1]) {
      if (open && open.prefix === m[2]) entries.push({ prefix: escapeRe(m[2]), body: prepared.slice(open.end, m.index), tag: open.tag });
      else bad = true;
      open = null;
    } else {
      opened++;
      if (m[3] || open) bad = true;
      open = m[3] ? null : { prefix: m[2], end: m.index + m[0].length, tag: m[0] };
    }
  }
  if (open) bad = true;
  return { entries, bad: bad || entries.length !== opened };
}

// The location in each entry, read only in the entry's own namespace (so <image:loc> inside a <url>
// is not the page's location). RSS items carry <link>URL</link>, Atom entries <link href="URL"/>.
// <loc> may carry attributes (<loc xmlns="...">); quoted values stop at '<', as in xmlSyntaxOk. RSS <link>
// takes none, and an Atom <link href> in an item (its prefix dropped in parseSitemap) is not the item's link.
const XML_ATTRS = `(?:\\s+[^\\s=/>]+\\s*=\\s*(?:"[^"<]*"|'[^'<]*'))*\\s*`;
const FORMATS = {
  urlset: { entry: 'url', loc: (e) => [...e.body.matchAll(new RegExp(`<${e.prefix}loc${XML_ATTRS}>([^<]*)</${e.prefix}loc\\s*>`, 'gi'))].map((m) => m[1]) },
  sitemapindex: { entry: 'sitemap', loc: (e) => [...e.body.matchAll(new RegExp(`<${e.prefix}loc${XML_ATTRS}>([^<]*)</${e.prefix}loc\\s*>`, 'gi'))].map((m) => m[1]) },
  rss: { entry: 'item', loc: (e) => [...e.body.matchAll(/<link\s*>([^<]*)<\/link\s*>/gi)].map((m) => m[1]) },
  feed: { entry: 'entry', loc: (e) => [...e.body.matchAll(/<link\b([^>]*?)\/?(?:>|$)/gi)].map((m) => attrs(m[1])).filter((a) => !a.rel || a.rel === 'alternate').map((a) => escapeXml(a.href ?? '')).slice(0, 1) },
};

/** Parse one sitemap file: XML (urlset, sitemapindex, RSS 2.0, Atom 1.0) or text (one URL per line).
    Returns { kind, locs, problem } where problem explains why the file can't be trusted whole. */
function parseSitemap(text) {
  let body = text.replace(/^\uFEFF/, '');
  if (!/^\s*</.test(body)) {
    const locs = body.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
    return { kind: 'text', locs, problem: null };
  }
  // Well-formedness is judged on the file as written, before prefixes are dropped.
  const syntaxOk = xmlSyntaxOk(body);
  // A prefix bound to the sitemap or Atom namespace names the same elements as no prefix
  // (<urlset xmlns="..." xmlns:s="..."><s:url>), so those prefixes are dropped in one pass.
  const prefixes = new Set([...prepareXml(body).matchAll(/\sxmlns:([A-Za-z_][\w.-]*)\s*=\s*["'](?:http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9|http:\/\/www\.w3\.org\/2005\/Atom)["']/g)].map((m) => m[1]));
  if (prefixes.size) body = body.replace(new RegExp(`<(/?)(?:${[...prefixes].map(escapeRe).join('|')}):`, 'g'), '<$1');
  const root = xmlRoot(body);
  const format = Object.hasOwn(FORMATS, root ?? '') ? FORMATS[root] : null;
  if (!format) return { kind: null, locs: [], problem: `the root element is <${root ?? '?'}>, not <urlset>, <sitemapindex>, RSS or Atom` };
  const prepared = prepareXml(body);
  const { entries, bad } = xmlEntries(prepared, format.entry);
  const found = entries.map((e) => format.loc(e));
  const locs = found.filter((l) => l.length === 1).map((l) => decodeEntities(l[0]).trim());
  let problem = null;
  if (!syntaxOk) problem = 'the XML is cut off or malformed (unclosed or misnested tags, a bare &, stray <, or text after the root element)';
  else if (bad) problem = `a <${format.entry}> never closes, nests or self-closes`;
  else if (root !== 'rss' && found.some((l) => l.length !== 1)) problem = `a <${format.entry}> does not hold exactly one location`;
  return { kind: root, locs, problem };
}

// ---------- HTML ----------

// Out-of-range numeric references (&#x110000;) become U+FFFD, as browsers do, instead of throwing.
// Numeric references as the HTML spec reads them: 0, surrogates and out-of-range values become
// U+FFFD, and 128-159 are the windows-1252 characters old pages meant (&#150; is an en dash).
const C1 = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x2c6, 0x89: 0x2030, 0x8a: 0x160, 0x8b: 0x2039, 0x8c: 0x152, 0x8e: 0x17d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x2dc, 0x99: 0x2122, 0x9a: 0x161, 0x9b: 0x203a, 0x9c: 0x153, 0x9e: 0x17e, 0x9f: 0x178 };
const codePoint = (n) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(C1[n] ?? n) : '\uFFFD');

// Named references common in titles and descriptions; others are left as written.
const NAMED = {
  nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', amp: '&', mdash: '—', ndash: '–', hellip: '…', middot: '·',
  bull: '•', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', divide: '÷', euro: '€', pound: '£', yen: '¥', cent: '¢',
  sect: '§', para: '¶', iexcl: '¡', iquest: '¿', shy: '', zwnj: '\u200c', zwj: '\u200d', thinsp: ' ', ensp: ' ', emsp: ' ',
};
for (const [accent, chars] of Object.entries({
  grave: { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' }, acute: { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý' },
  circ: { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' }, tilde: { a: 'ã', n: 'ñ', o: 'õ' }, uml: { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', y: 'ÿ' },
  ring: { a: 'å' }, cedil: { c: 'ç' }, slash: { o: 'ø' },
})) {
  for (const [letter, ch] of Object.entries(chars)) { NAMED[letter + accent] = ch; NAMED[letter.toUpperCase() + accent] = ch.toUpperCase(); }
}
Object.assign(NAMED, { szlig: 'ß', aelig: 'æ', AElig: 'Æ', oelig: 'œ', OElig: 'Œ', eth: 'ð', thorn: 'þ' });

// One pass, so a decoded '&' is never decoded again (&#38;copy; is the text "&copy;").
const named = (n) => (Object.hasOwn(NAMED, n) ? NAMED[n] : Object.hasOwn(NAMED, n.toLowerCase()) ? NAMED[n.toLowerCase()] : null);
function decodeEntities(s) {
  return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([A-Za-z][A-Za-z0-9]*));/gi, (m, hex, dec, name) => (
    hex !== undefined ? codePoint(parseInt(hex, 16)) : dec !== undefined ? codePoint(Number(dec)) : named(name) ?? m));
}

// A tag's attributes, as a browser reads them; quoted values may contain '>' (href="/f?q=3>2"): a quote opens a value only right after '=' (alt=Joe's
// is one unquoted value), and an unclosed quoted value runs to the end of the input. Every tag regex
// ends in (?:>|$), so a tag without its '>' takes the rest of the input and no match ever fails and
// rescans the page.
const ATTRS = `(?:[^>=]+|=\\s*"[^"]*(?:"|$)|=\\s*'[^']*(?:'|$)|=)*`;
// A start or end tag: its name runs to whitespace, '/' or '>' as in a browser (<a.b> is not an <a>).
const TAG = `<(/?)([A-Za-z][^\\s/>]*)(${ATTRS})(?:>|$)`;

function attrs(s) {
  const out = {};
  for (const m of (s ?? '').matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = m[1].toLowerCase();
    // A repeated attribute keeps its first value, as HTML parsers do.
    if (!(name in out)) out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

// Elements whose content is text, not markup. Their content is set aside in one left-to-right
// pass together with comments, so "<!--" inside a script or a tag inside a title stays text.
// <noscript> is text too: Google reads pages with scripting on.
const RAW_TEXT = new Set(['script', 'style', 'template', 'textarea', 'title', 'xmp', 'noembed', 'noframes', 'noscript']);
// Google stops reading <head> metadata at the first element that does not belong in <head>.
// <noframes> stays in <head> too: the HTML parser reads it there as text.
const HEAD_ELEMENTS = new Set(['html', 'head', 'title', 'meta', 'link', 'script', 'style', 'base', 'noscript', 'template', 'noframes']);
// Name codes for parseHtml's tag list: HEAD_ELEMENTS first, then the other names the checks read;
// any other name is OTHER. Codes start at 1, so an end tag is stored as the negative code.
const CODED = [...HEAD_ELEMENTS, 'body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img'];
const NAME_CODE = new Map(CODED.map((n, i) => [n, i + 1]));
const OTHER = CODED.length + 1;
const HEAD = NAME_CODE.get('head'), BODY = NAME_CODE.get('body'), H1 = NAME_CODE.get('h1');
// Elements whose attributes parseHtml reads.
const KEEP_ATTRS = new Set(['base', 'title', 'meta', 'link', 'a', 'img']);

function parseHtml(html, pageUrl) {
  const jsonld = [];
  const titleTexts = [];
  let doc = '';
  // Every tag is matched whole, so "<script>" or "<!--" inside a quoted attribute stays attribute text.
  // DOCTYPE and bogus comments (<!x>, <?x>, </ x>, </>) end at the first '>' and are dropped.
  const opener = new RegExp(`<!--|${TAG}|<[!?][^>]*(?:>|$)|</(?![A-Za-z])[^>]*(?:>|$)`, 'g');
  let pos = 0;
  for (let m; (m = (opener.lastIndex = pos, opener.exec(html)));) {
    doc += html.slice(pos, m.index);
    if (m[0] === '<!--') {
      // <!--> and <!---> are complete (empty) comments.
      const short = /^-?>/.exec(html.slice(m.index + 4, m.index + 6));
      if (short) { pos = m.index + 4 + short[0].length; continue; }
      const end = html.indexOf('-->', m.index + 4);
      pos = end === -1 ? html.length : end + 3;
      continue;
    }
    if (m[2] === undefined) { pos = m.index + m[0].length; continue; }
    const name = m[2].toLowerCase();
    if (m[1] || !RAW_TEXT.has(name)) { doc += m[0]; pos = m.index + m[0].length; continue; }
    // As in a browser, </script foo> and </script/> close a script too.
    const close = new RegExp(`</${name}(?=[\\s/>])${ATTRS}(?:>|$)`, 'gi');
    close.lastIndex = m.index + m[0].length;
    const c = close.exec(html);
    const inner = html.slice(m.index + m[0].length, c ? c.index : html.length);
    pos = c ? c.index + c[0].length : html.length;
    if (name === 'script' && (attrs(m[3]).type ?? '').trim().toLowerCase() === 'application/ld+json') jsonld.push(inner);
    // Kept as an empty element so the head scan sees where it was; the text is looked up by index.
    if (name === 'title') { doc += `<title data-seo-title="${titleTexts.length}"></title>`; titleTexts.push(decodeEntities(inner).replace(/\s+/g, ' ').trim()); }
    else doc += `<${name}></${name}>`;
  }
  doc += html.slice(pos);

  // Every tag in one pass, each matched whole, so tag-shaped text inside a quoted attribute value
  // (title="<meta name=robots content=noindex>") stays attribute text. Names are read whole:
  // <img-comparison-slider> is not an <img>. Each tag keeps its position and a name code (OTHER for
  // names no check reads; negative for an end tag) in typed arrays, so a 15 MB page of tiny tags
  // stays small; attributes are kept only for the tags read below.
  let ats = new Int32Array(1024), ends = new Int32Array(1024), codes = new Int8Array(1024), n = 0;
  const grow = (a) => { const b = new a.constructor(a.length * 2); b.set(a); return b; };
  const kept = new Map([...KEEP_ATTRS].map((name) => [name, []]));
  const tag = new RegExp(TAG, 'g');
  for (let m; (m = tag.exec(doc));) {
    if (n === ats.length) { ats = grow(ats); ends = grow(ends); codes = grow(codes); }
    const name = m[2].toLowerCase();
    const code = NAME_CODE.get(name) ?? OTHER;
    ats[n] = m.index; ends[n] = tag.lastIndex; codes[n] = m[1] ? -code : code; n++;
    if (!m[1]) kept.get(name)?.push({ at: m.index, raw: m[3] });
  }

  // The head ends at </head>, <body>, the first element outside HEAD_ELEMENTS, or the first
  // non-blank text. Raw-text elements are empty placeholders here.
  let headEnd = doc.length;
  let headBreaker = null;
  let last = 0;
  for (let i = 0; i < n; i++) {
    if (/\S/.test(decodeEntities(doc.slice(last, ats[i])))) { headEnd = last; headBreaker = 'text'; break; }
    if (codes[i] === -HEAD || codes[i] === BODY) { headEnd = ats[i]; break; }
    if (codes[i] > HEAD_ELEMENTS.size) {
      headEnd = ats[i];
      headBreaker = `<${new RegExp(TAG, 'y').exec(doc.slice(ats[i], ends[i]))[2].toLowerCase()}>`;
      break;
    }
    last = ends[i];
  }
  if (headEnd === doc.length && /\S/.test(doc.slice(last))) headEnd = last;
  const inHead = (t) => t.at < headEnd;
  // Only worth reporting when the page meant more head to follow.
  let closedLater = false;
  for (let i = 0; i < n && !closedLater; i++) closedLater = codes[i] === -HEAD && ats[i] >= headEnd;
  if (headBreaker && !closedLater) headBreaker = null;

  const tags = (name, where = () => true) => kept.get(name).filter(where).map((t) => attrs(t.raw));
  // An unclosed <h1> ends at the next heading, as in a browser, or at the end of the page. Each scan
  // stops at the next <h1> at the latest, so the scans never overlap.
  const h1 = [];
  for (let i = 0; i < n; i++) {
    if (codes[i] !== H1 || ats[i] < headEnd) continue;
    let j = i + 1;
    while (j < n && codes[j] !== -H1 && !(codes[j] >= H1 && codes[j] < H1 + 6)) j++;
    // Its text with the tags inside it removed: matching from the end of the <h1> finds the same
    // tags as the pass above (quoted '>' included).
    const inner = doc.slice(ends[i], j < n ? ats[j] : doc.length).replace(new RegExp(TAG, 'g'), ' ');
    h1.push(decodeEntities(inner).replace(/\s+/g, ' ').trim());
  }
  const baseHref = tags('base', inHead)[0]?.href;
  let base = pageUrl;
  try { if (baseHref) base = new URL(baseHref, pageUrl).href; } catch { /* keep page URL */ }

  const titles = tags('title', inHead).map((t) => titleTexts[Number(t['data-seo-title'])] ?? '');
  const metas = tags('meta', inHead);
  const metaContent = (name, list = metas) => list.filter((m) => (m.name ?? '').toLowerCase() === name).map((m) => m.content ?? '');
  // Google honors robots meta tags anywhere in the page, body included.
  const allMetas = tags('meta');
  const relHas = (l, token) => (l.rel ?? '').toLowerCase().split(/\s+/).includes(token);
  const headLinks = tags('link', inHead);
  const bodyLinks = tags('link', (t) => !inHead(t));

  const links = [];
  for (const a of tags('a')) {
    const href = (a.href ?? '').trim();
    if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      u.hash = '';
      links.push(u.href);
    } catch { /* unparseable href */ }
  }

  return {
    base, // document base URL: <base href>, else the page URL; relative metadata URLs resolve against it
    headBreaker, // what ended <head> before its </head>, or null
    titles,
    descriptions: metaContent('description'),
    robots: [...metaContent('robots', allMetas), ...metaContent('googlebot', allMetas)].join('\n').toLowerCase(), // one meta tag per line
    viewport: metaContent('viewport').length > 0,
    // href stays null when absent, so <link rel=canonical> with no href is not read as "this page".
    canonicals: headLinks.filter((l) => relHas(l, 'canonical')).map((l) => l.href?.trim() ?? null),
    bodyCanonicals: bodyLinks.filter((l) => relHas(l, 'canonical')).map((l) => l.href?.trim() ?? null),
    hreflang: headLinks.filter((l) => relHas(l, 'alternate') && l.hreflang !== undefined).map((l) => ({ lang: l.hreflang.trim(), href: (l.href ?? '').trim() })),
    h1,
    imgsNoAlt: tags('img', (t) => !inHead(t)).filter((i) => !('alt' in i)).length,
    jsonld,
    links: [...new Set(links)],
  };
}

function jsonldTypes(blocks) {
  const types = new Set();
  const errors = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const t = v['@type'];
    if (t) (Array.isArray(t) ? t : [t]).forEach((x) => types.add(String(x)));
    Object.values(v).forEach(walk);
  };
  blocks.forEach((b, i) => {
    if (!b.trim()) return; // an empty block holds no data to lose
    try { walk(JSON.parse(b)); } catch (err) { errors.push(`block ${i + 1}: ${err.message}`); }
  });
  return { types: [...types].sort(), errors };
}

// ---------- check mode ----------

function parseArgs(argv) {
  const opts = { url: null, out: null, maxPages: 200, urls: null, include: null, delay: null, publicOrigin: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--out') opts.out = need();
    else if (a === '--max-pages') opts.maxPages = Number(need());
    else if (a === '--urls') opts.urls = need();
    else if (a === '--include') opts.include = need();
    else if (a === '--delay') opts.delay = Number(need());
    else if (a === '--public-origin') {
      const v = need();
      try { opts.publicOrigin = new URL(v).origin; } catch { throw new Error(`--public-origin "${v}" is not a URL`); }
    }
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else if (!opts.url) opts.url = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!opts.url) throw new Error('missing <url>');
  if (opts.urls && opts.include) throw new Error('--urls and --include cannot be combined; add the URLs to the --urls list');
  if (!Number.isInteger(opts.maxPages) || opts.maxPages < 1) throw new Error('--max-pages must be a positive integer');
  return opts;
}

async function check(opts) {
  const requested = new URL(/^https?:\/\//i.test(opts.url) ? opts.url : `https://${opts.url}`);
  requested.hash = '';
  // robots.txt per origin, fetched once. The start URL and each hop of its redirects
  // are checked against it before they are requested, like every other fetch.
  // robots.txt redirects are followed across origins, up to five hops (RFC 9309), and the
  // file is read whatever its content type, up to Google's 500 KiB.
  const robotsCache = new Map();
  const robotsParsed = new Map();
  const robotsFor = async (o) => {
    if (!robotsCache.has(o)) robotsCache.set(o, await fetchChain(o + '/robots.txt', () => null, (u) => u, { maxRedirects: ROBOTS_MAX_REDIRECTS, file: true, max: ROBOTS_MAX_BYTES }));
    const res = robotsCache.get(o);
    if (!robotsParsed.has(o)) robotsParsed.set(o, res.status === 200 && res.body !== null ? parseRobots(res.body) : null);
    return robotsParsed.get(o);
  };
  const startGuard = async (next) => (googlebotAllowed(await robotsFor(new URL(next).origin), next) ? null : 'redirect target is disallowed by robots.txt; not followed');
  const startBlocked = !googlebotAllowed(await robotsFor(requested.origin), requested.href);
  // Crawl from where the start URL lands (http -> https, apex -> www, /old -> /new):
  // its origin decides which links are internal, and it is the page judged as the start page.
  // A preview that redirects to the production origin stays on the preview.
  const toPreview = (u) => {
    if (!opts.publicOrigin || opts.publicOrigin === requested.origin) return u;
    const x = new URL(u);
    return x.origin === opts.publicOrigin ? requested.origin + x.pathname + x.search + x.hash : u;
  };
  const first = startBlocked ? null : await fetchChain(requested.href, startGuard, toPreview);
  const start = new URL(first && first.status !== null && first.chain.length > 1 ? first.finalUrl : requested.href);
  const origin = start.origin;
  const publicOrigin = opts.publicOrigin && opts.publicOrigin !== origin ? opts.publicOrigin : null;
  // Every URL is compared in one form: parsed (lower-case scheme and host, "/" path for an
  // origin), no fragment, and production-origin URLs read as the same path here.
  const mapUrl = (u) => {
    try {
      const x = new URL(u);
      x.hash = '';
      return publicOrigin && x.origin === publicOrigin ? origin + x.pathname + x.search : x.href;
    } catch { return u; }
  };
  const sameOrigin = (u) => { try { return new URL(u).origin === origin; } catch { return false; } };
  // Reuse that response as the start page's own fetch: its last hop is the start page.
  const prefetched = new Map();
  if (first && !first.error && !first.stopped && first.status !== null) prefetched.set(start.href, { ...first, chain: [first.chain.at(-1)], finalUrl: start.href });
  // A preview runs on this machine or the local network (Vite prints a LAN "Network" URL).
  const isLocal = (host) => /^(localhost|.+\.localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1?\]|\[f[cd][0-9a-f]*:.*\]|\[fe80:.*\])$/i.test(host);
  const local = isLocal(start.hostname);
  // A local start URL that redirects off the machine would audit the other site in its place.
  const leftLocal = isLocal(requested.hostname) && !local;
  const delay = opts.delay ?? (local ? 0 : 200);
  const startedAt = new Date().toISOString();
  const findings = [];
  const add = (rule, severity, url, message, key = url) => findings.push({ id: `${rule}|${key}`, rule, severity, url, message });
  const limits = [
    'Raw HTML only: tags added by JavaScript in the browser are not seen.',
    'Structured data is checked for valid JSON and a @type, not against Google rich-result requirements.',
    'No rankings, Search Console data, Core Web Vitals or Lighthouse.',
    'Repeated X-Robots-Tag headers arrive joined, so a user-agent prefix is read as covering only its own directive; a bare noindex after "otherbot: ..." counts for Google.',
    `Pages are read up to ${MAX_BYTES / 1024 / 1024} MB, as Google reads them; markup past that is ignored.`,
  ];

  if (first && !first.error && first.status !== null && first.status < 400 && first.chain.length > 2) add('redirect-chain', 'warn', requested.href, `${first.chain.length - 1} redirect hops: ${first.chain.map((c) => `${c.status} ${c.url}`).join(' -> ')}`);
  if (start.href !== requested.href) add('start-redirects', 'info', requested.href, `start URL redirects to ${start.href} (${first.chain.map((c) => c.status).join(' -> ')}); crawled from there${first.stopped ? `, but ${first.stopped}` : ''}`);

  let fetches = robotsCache.size + (first ? 1 : 0);
  const fetchBudget = opts.maxPages + 50; // page requests; room for canonical and hreflang targets outside the crawl
  let pageFetches = 0;
  const pages = new Map();
  const linkedFrom = new Map();
  const bigPages = new Set(); // pages cut at MAX_BYTES
  const timed = async (url, guard, fetchOpts = {}) => {
    if (fetches > 0 && delay > 0) await sleep(delay);
    fetches++;
    return fetchChain(url, guard, mapUrl, fetchOpts);
  };
  const originGuard = (next) => (sameOrigin(next) ? null : 'redirect leaves the audited origin; not followed');
  let robots = null;
  const pageGuard = (next) => originGuard(next) ?? (googlebotAllowed(robots, next) ? null : 'redirect target is disallowed by robots.txt; not followed');
  let needsPublicOrigin = leftLocal;

  // robots.txt
  if (!robotsCache.has(origin)) { fetches++; await robotsFor(origin); }
  const robotsRes = robotsCache.get(origin);
  if (robotsRes.status === 200 && robotsRes.body !== null) robots = await robotsFor(origin);
  // Google treats 429 like a server error, not like a missing file.
  else if (robotsRes.status !== null && (robotsRes.status >= 500 || robotsRes.status === 429)) add('robots-server-error', 'fail', origin + '/robots.txt', `robots.txt answered ${robotsRes.status}; Google stops crawling the site for the first 12 hours of robots.txt server errors (429 counts as one)`);
  // Too many redirects or a loop: Google stops following and treats robots.txt as missing.
  else if (robotsRes.error && !/redirect/.test(robotsRes.error)) add('robots-unreachable', 'fail', origin + '/robots.txt', `robots.txt fetch failed (${robotsRes.error}); Google treats that like a server error and stops crawling for the first 12 hours`);
  else add('robots-missing', 'info', origin + '/robots.txt', `no robots.txt (${robotsRes.error ?? `HTTP ${robotsRes.status}`}); crawlers treat that as "allow everything"`);
  if (robots && !googlebotAllowed(robots, origin + '/')) add('robots-blocks-root', 'fail', origin + '/robots.txt', 'robots.txt disallows / for Googlebot');

  // sitemaps
  const sitemapUrls = new Set();
  let sitemapComplete = true; // every sitemap file found was read; membership findings depend on it
  let sitemapsRead = 0; // files parsed, empty ones included: membership findings need at least one
  const robotsSitemaps = [];
  for (const s of robots?.sitemaps ?? []) {
    // Google ignores a Sitemap line that is not a full URL.
    if (httpUrl(s)) robotsSitemaps.push(mapUrl(s));
    else add('sitemap-bad-url', 'fail', s, `robots.txt Sitemap line "${s}" is not an absolute http(s) URL; Google ignores it`);
  }
  const declared = robotsSitemaps.filter(sameOrigin);
  // A local preview whose robots.txt or sitemap index names the production sitemap never reads it.
  const otherOriginSitemap = (s, where) => {
    sitemapComplete = false;
    add('sitemap-other-origin', 'info', s, `${where} declares a sitemap on another origin; not fetched`);
    if (local && !publicOrigin) needsPublicOrigin = true;
  };
  for (const s of robotsSitemaps) if (!declared.includes(s)) otherOriginSitemap(s, 'robots.txt');
  const fallback = origin + '/sitemap.xml';
  const sitemapQueue = robotsSitemaps.length ? [...new Set(declared)] : [fallback];
  const sitemapFiles = [];
  const sitemapSeen = new Set(sitemapQueue);
  const fromIndex = new Set();
  const unreadable = (smUrl, why) => {
    sitemapComplete = false;
    if (declared.includes(smUrl)) add('sitemap-unreachable', 'fail', smUrl, `sitemap declared in robots.txt ${why}`);
    else if (fromIndex.has(smUrl)) add('sitemap-unreachable', 'fail', smUrl, `sitemap listed in a sitemap index ${why}`);
    else add('sitemap-missing', 'warn', smUrl, `no sitemap declared in robots.txt and ${smUrl} ${why}`);
  };
  while (sitemapQueue.length && sitemapFiles.length < MAX_SITEMAP_FILES) {
    const smUrl = sitemapQueue.shift();
    sitemapFiles.push(smUrl);
    // Google reads a sitemap only where robots.txt lets Googlebot fetch it, redirects included.
    if (!googlebotAllowed(robots, smUrl)) { unreadable(smUrl, 'is disallowed by robots.txt for Googlebot'); continue; }
    const res = await timed(smUrl, pageGuard, { file: true, max: SITEMAP_MAX_BYTES });
    if (res.status !== 200 || res.body === null) {
      unreadable(smUrl, res.stopped ? `redirects to ${res.finalUrl}, not followed: ${res.stopped}` : `answered ${res.status ?? res.error}`);
      continue;
    }
    if (res.chain.length > 1) add('sitemap-redirect', 'warn', smUrl, `sitemap redirects to ${res.finalUrl}`);
    // Gzip is read with the built-in zlib, up to Google's 50 MB uncompressed limit.
    let body = res.body;
    let tooLarge = res.truncated;
    if (!tooLarge && res.bytes?.[0] === 0x1f && res.bytes?.[1] === 0x8b) {
      try { body = decodeUtf8(gunzipSync(res.bytes, { maxOutputLength: SITEMAP_MAX_BYTES })); }
      catch (err) {
        sitemapComplete = false;
        if (err?.code === 'ERR_BUFFER_TOO_LARGE') tooLarge = true;
        else { add('sitemap-invalid', 'fail', smUrl, `gzipped sitemap could not be decompressed (${err?.code ?? err?.message})`); continue; }
      }
    }
    if (tooLarge) { sitemapComplete = false; add('sitemap-too-large', 'fail', smUrl, `sitemap is over ${SITEMAP_MAX_BYTES / 1024 / 1024} MB uncompressed; Google rejects it`); continue; }
    let parsed;
    // A pathological file (one tag with a million attributes) can overflow the pattern stack; that
    // file is unreadable, not the whole run.
    try { parsed = parseSitemap(body); } catch (err) {
      sitemapComplete = false;
      add('sitemap-invalid', 'fail', smUrl, `sitemap could not be read (${err?.message ?? err}); Google may reject the file`);
      continue;
    }
    // The undeclared fallback answering with an HTML page (a single-page app's catch-all) is no sitemap.
    if (!parsed.kind && smUrl === fallback && !declared.length && /html/i.test(res.headers['content-type'] ?? '') && xmlRoot(body) === 'html') {
      unreadable(smUrl, 'answered with an HTML page');
      continue;
    }
    if (parsed.problem) {
      sitemapComplete = false; // entries read so far are still crawled, but membership is not trusted
      add('sitemap-invalid', 'fail', smUrl, `sitemap is not valid: ${parsed.problem}; Google may reject the file`);
      if (!parsed.kind) continue;
    }
    sitemapsRead++;
    if (parsed.locs.length > SITEMAP_MAX_URLS) { sitemapComplete = false; add('sitemap-too-large', 'fail', smUrl, `sitemap lists ${parsed.locs.length} URLs; Google reads at most ${SITEMAP_MAX_URLS} per file`); }
    if (!parsed.locs.length && !parsed.problem) add('sitemap-empty', 'warn', smUrl, 'sitemap lists no URLs');
    if (parsed.kind === 'sitemapindex') {
      // Google does not follow an index listed inside another index.
      if (fromIndex.has(smUrl)) { sitemapComplete = false; add('sitemap-invalid', 'fail', smUrl, 'nested sitemap index: Google does not read the sitemaps an index inside an index lists'); continue; }
      for (const raw of parsed.locs) {
        if (!httpUrl(raw)) { sitemapComplete = false; add('sitemap-bad-url', 'fail', raw, `sitemap index ${smUrl} lists a <loc> that is not an absolute http(s) URL; that sitemap is never read`); continue; }
        const loc = mapUrl(raw);
        if (!sameOrigin(loc)) { otherOriginSitemap(loc, `sitemap index ${smUrl}`); continue; }
        fromIndex.add(loc);
        if (!sitemapSeen.has(loc)) { sitemapSeen.add(loc); sitemapQueue.push(loc); }
      }
    } else parsed.locs.forEach((loc) => sitemapUrls.add(mapUrl(loc)));
  }
  if (sitemapQueue.length) sitemapComplete = false;
  if (sitemapQueue.length) add('sitemap-files-skipped', 'info', origin, `${sitemapQueue.length} sitemap files beyond the first ${MAX_SITEMAP_FILES} not read`);
  if (!robots?.sitemaps?.length && sitemapsRead) add('sitemap-not-declared', 'info', origin + '/robots.txt', 'sitemap.xml exists but robots.txt has no Sitemap line');
  for (const loc of sitemapUrls) {
    try {
      if (!httpUrl(loc)) throw new Error('not http(s)');
      if (new URL(loc).origin !== origin) {
        if (local && !publicOrigin) needsPublicOrigin = true;
        else add('sitemap-foreign-url', 'warn', loc, 'sitemap lists a URL on another origin');
      }
    } catch { add('sitemap-bad-url', 'fail', loc, 'sitemap <loc> is not a valid absolute http(s) URL'); }
  }

  const getPage = async (url) => {
    if (pages.has(url)) return pages.get(url);
    if (!googlebotAllowed(robots, url)) {
      const rec = { url, blocked: true };
      pages.set(url, rec);
      return rec;
    }
    // The budget counts page requests only: robots.txt, sitemap files and the already-fetched start page are free.
    if (!prefetched.has(url) && pageFetches >= fetchBudget) return null;
    if (!prefetched.has(url)) pageFetches++;
    const res = prefetched.get(url) ?? await timed(url, pageGuard);
    prefetched.delete(url);
    // With no content type, a body that starts like an HTML document is read as HTML, as browsers sniff it.
    const type = res.headers['content-type'] ?? '';
    const isHtml = /text\/html|application\/xhtml/i.test(type) || (!type && /^\s*<(!doctype html|html|head)\b/i.test(res.body ?? ''));
    let html = null;
    let parseError = null;
    if (isHtml && res.body !== null) {
      try {
        html = parseHtml(res.body, res.finalUrl);
        html.links = [...new Set(html.links.map(mapUrl))];
      } catch (err) { parseError = err?.message ?? String(err); }
    }
    const rec = {
      url, blocked: false, status: res.status, finalUrl: res.finalUrl, chain: res.chain, error: res.error,
      stopped: res.stopped ?? null, html, parseError, type,
      // Cut at MAX_BYTES, where Google stops reading too: the page is judged on what Google sees.
      truncated: Boolean(res.truncated),
      xRobots: (res.headers['x-robots-tag'] ?? '').toLowerCase(),
    };
    if (rec.truncated) bigPages.add(url);
    rec.noindex = hasNoindex(`${rec.xRobots}\n${rec.html?.robots ?? ''}`);
    rec.indexable = rec.status === 200 && rec.chain.length === 1 && rec.html !== null && !rec.noindex;
    pages.set(url, rec);
    return rec;
  };

  // crawl: start URL, then internal links breadth-first, then unseen sitemap URLs
  const queue = [];
  const queued = new Set();
  const enqueue = (u) => { if (!queued.has(u)) { queued.add(u); queue.push(u); } };
  // Listed URLs go through the same mapping and origin rule as discovered ones.
  const readList = (file) => readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .flatMap((l) => {
      try { return [mapUrl(new URL(l, start).href)]; } catch { add('listed-url-invalid', 'info', l, `${file} lists "${l}", which is not a URL; skipped`); return []; }
    })
    .filter((u) => (sameOrigin(u) ? true : (add('listed-url-other-origin', 'info', u, `${file} lists a URL on another origin; not fetched`), false)));
  let list = null;
  let listed = new Set();
  if (opts.urls) {
    list = readList(opts.urls);
    listed = new Set(list);
    // The start page is always read: whether the run is complete depends on it.
    enqueue(start.href);
    list.forEach(enqueue);
  } else {
    enqueue(start.href);
    // --include: URLs to fetch on top of the crawl, e.g. pages a previous run flagged.
    if (opts.include) readList(opts.include).forEach(enqueue);
  }
  let crawled = 0;
  let truncated = false;
  const runQueue = async (follow) => {
    while (queue.length) {
      if (crawled >= opts.maxPages) { truncated = true; return; }
      const url = queue.shift();
      const rec = await getPage(url);
      if (!rec) { truncated = true; return; }
      // In a --urls run the start page is read for completeness only; --max-pages counts the listed URLs.
      if (!list || url !== start.href || listed.has(url)) crawled++;
      // A redirect target is a page of its own: check it even when nothing links to it.
      if (!rec.blocked && rec.chain.length > 1 && sameOrigin(rec.finalUrl)) enqueue(rec.finalUrl);
      if (!follow || !rec.html) continue;
      for (const link of rec.html.links) {
        // A page linking to itself does not make it reachable.
        if (!sameOrigin(link) || link === rec.finalUrl || link === rec.url) continue;
        if (!linkedFrom.has(link)) linkedFrom.set(link, new Set());
        linkedFrom.get(link).add(rec.finalUrl);
        if (!SKIP_EXT.test(new URL(link).pathname)) enqueue(link);
      }
    }
  };
  await runQueue(!list);
  if (!truncated && !list) {
    for (const loc of sitemapUrls) if (sameOrigin(loc)) enqueue(loc);
    await runQueue(true); // sitemap-only pages link out too; same page budget
  }
  if (truncated) limits.push(`Crawl stopped at --max-pages ${opts.maxPages}; orphan results cover only links on fetched pages.`);

  const startRec = pages.get(start.href);
  if (local && !opts.publicOrigin && startRec?.html && !startRec.html.links.some(sameOrigin)) {
    const paths = new Map();
    for (const link of startRec.html.links) {
      if (!httpUrl(link)) continue;
      const u = new URL(link);
      (paths.get(u.origin) ?? paths.set(u.origin, new Set()).get(u.origin)).add(u.pathname);
    }
    for (const [o, p] of paths) {
      if (p.size < 3) continue;
      needsPublicOrigin = true;
      add('start-links-other-origin', 'info', startRec.url, `the start page links to no local page but to ${p.size} paths on ${o}; if that is the production origin, rerun with --public-origin ${o} (a site with no production origin: pass its local origin)`, `${startRec.url}|${o}`);
    }
  }

  // per-page findings
  // The one head canonical as an http(s) URL without its fragment, or null (none, several, missing href, unusable).
  const canonicalOf = (rec) => {
    const c = rec.html?.canonicals ?? [];
    if (c.length !== 1 || !c[0]) return null;
    try { const u = new URL(c[0], rec.html.base); return /^https?:$/.test(u.protocol) ? mapUrl(u.href) : null; } catch { return null; }
  };
  const inSitemap = (rec) => sitemapUrls.has(rec.url) || sitemapUrls.has(rec.finalUrl);
  const linkedInfo = (url) => { const f = linkedFrom.get(url); return f ? ` (linked from ${[...f].slice(0, 3).join(', ')}${f.size > 3 ? ` and ${f.size - 3} more` : ''})` : ''; };

  const judge = async (rec) => {
    const { url } = rec;
    if (rec.blocked) {
      if (sitemapUrls.has(url)) add('sitemap-url-blocked', 'fail', url, 'sitemap lists a URL robots.txt disallows for Googlebot');
      else if (linkedFrom.has(url)) add('linked-url-blocked', 'info', url, `internal link to a URL robots.txt disallows for Googlebot${linkedInfo(url)}`);
      return;
    }
    if (rec.error || rec.status === null) { add('fetch-error', 'fail', url, `fetch failed: ${rec.error}${linkedInfo(url)}`); return; }
    const finalStatus = rec.status;
    if (finalStatus >= 400) {
      add('http-error', 'fail', url, `HTTP ${finalStatus}${rec.chain.length > 1 ? ` after redirect to ${rec.finalUrl}` : ''}${linkedInfo(url)}${inSitemap(rec) ? ' (listed in the sitemap)' : ''}`);
      return;
    }
    if (rec.chain.length > 2) add('redirect-chain', 'warn', url, `${rec.chain.length - 1} redirect hops: ${rec.chain.map((c) => `${c.status} ${c.url}`).join(' -> ')}`);
    if (rec.chain.length > 1) {
      const note = rec.stopped ? ` (${rec.stopped})` : '';
      if (sitemapUrls.has(url)) add('sitemap-url-redirects', 'warn', url, `sitemap lists a redirecting URL; list ${rec.finalUrl} instead${note}`);
      else if (linkedFrom.has(url)) add('linked-url-redirects', 'info', url, `internal links point at a redirect to ${rec.finalUrl}${note}${linkedInfo(url)}`);
      // The target is checked as its own page. The crawl queues it already; a redirect reached
      // through a canonical or hreflang target is fetched here so the judge loop checks it too.
      if (!rec.stopped && !rec.error && sameOrigin(rec.finalUrl) && !pages.has(rec.finalUrl) && !(await getPage(rec.finalUrl))) {
        overBudget.add(rec.finalUrl);
        budgetSkipped.add(rec.finalUrl);
      }
      return;
    }
    if (finalStatus >= 300 && finalStatus < 400) {
      add('http-error', 'fail', url, `HTTP ${finalStatus} with no redirect to follow${linkedInfo(url)}${inSitemap(rec) ? ' (listed in the sitemap)' : ''}`);
      return;
    }
    if (finalStatus === 204 || finalStatus === 205) {
      add('http-no-content', 'fail', url, `HTTP ${finalStatus}: no content for Google to index${linkedInfo(url)}${inSitemap(rec) ? ' (listed in the sitemap)' : ''}`);
      return;
    }
    if (rec.parseError) { add('parse-error', 'fail', url, `HTML could not be read: ${rec.parseError}`); return; }
    if (!rec.html) {
      // Non-HTML files (PDFs, images) can still carry X-Robots-Tag: noindex.
      if (rec.noindex && inSitemap(rec)) add('sitemap-url-noindex', 'fail', url, 'sitemap lists a file whose X-Robots-Tag is noindex');
      else if (rec.noindex) add('noindex', 'info', url, 'file is noindex (X-Robots-Tag); confirm that is intended');
      return;
    }
    const h = rec.html;
    const isStart = url === startRec?.url || url === startRec?.finalUrl;
    if (rec.truncated) add('page-truncated', 'info', url, `page is over ${MAX_BYTES / 1024 / 1024} MB; Google indexes only the first ${MAX_BYTES / 1024 / 1024} MB, so anything after it (links, robots meta, structured data) does not count`);

    if (rec.noindex) {
      if (isStart) add('start-noindex', 'fail', url, `the start page is noindex (${hasNoindex(rec.xRobots) ? 'X-Robots-Tag' : 'meta robots'})`);
      else if (inSitemap(rec)) {
        add('sitemap-url-noindex', 'fail', url, 'sitemap lists a noindex page');
        // Set by meta robots alone: clearing it takes the page's HTML read again, not just a fetch.
        if (!hasNoindex(rec.xRobots)) findings.at(-1).via = 'meta';
      }
      else add('noindex', 'info', url, 'page is noindex; confirm that is intended');
    }
    if (h.headBreaker) add('head-ended-early', 'warn', url, `${h.headBreaker === 'text' ? 'text' : h.headBreaker} inside <head> ends the head for Google, which ignores the metadata after it`);
    if (!h.viewport) add('viewport-missing', 'warn', url, 'no <meta name="viewport">; Google indexes the mobile rendering');
    if (!h.titles.length) add('title-missing', 'fail', url, 'no <title> in <head>');
    else if (!h.titles[0]) add('title-empty', 'fail', url, '<title> is empty');
    else {
      if (h.titles.length > 1) add('title-multiple', 'warn', url, `${h.titles.length} <title> elements`);
      if (h.titles[0].length > TITLE_DISPLAY_CHARS) add('title-long', 'info', url, `title is ${h.titles[0].length} characters; results may cut it short`);
    }
    if (!h.descriptions.length || !h.descriptions[0].trim()) add('description-missing', 'warn', url, 'no meta description; Google writes its own snippet');
    if (!h.h1.length) add('h1-missing', 'info', url, 'no <h1>');
    if (h.imgsNoAlt) add('img-alt-missing', 'info', url, `${h.imgsNoAlt} <img> without an alt attribute`);

    // canonical
    if (h.bodyCanonicals.length && !h.canonicals.length) add('canonical-in-body', 'warn', url, 'rel=canonical sits in <body>, where Google ignores it');
    if (h.canonicals.length > 1) add('canonical-multiple', 'fail', url, `${h.canonicals.length} rel=canonical tags; Google ignores all of them`);
    else if (h.canonicals.length === 0) add('canonical-missing', 'info', url, 'no rel=canonical; Google picks the canonical itself');
    const canon = canonicalOf(rec);
    if (h.canonicals.length === 1 && !canon) add('canonical-invalid', 'fail', url, h.canonicals[0] ? `canonical "${h.canonicals[0]}" is not a valid http(s) URL; Google ignores it` : 'rel=canonical has no href; Google ignores it');
    else if (h.canonicals.length === 1 && !/^https?:\/\//i.test(h.canonicals[0])) add('canonical-relative', 'warn', url, `canonical "${h.canonicals[0]}" is relative; Google recommends an absolute URL`);
    if (canon && /#./.test(h.canonicals[0])) add('canonical-fragment', 'warn', url, `canonical "${h.canonicals[0]}" has a #fragment; Google says not to use one, and reads it as ${canon}`);
    if (canon && canon !== rec.finalUrl) {
      if (!sameOrigin(canon)) {
        if (local && !publicOrigin) needsPublicOrigin = true;
        add('canonical-other-origin', 'info', url, `canonical points to another origin: ${canon}`);
      }
      else {
        const target = await getPage(canon);
        if (!target) { budgetSkipped.add(canon); add('canonical-not-checked', 'info', url, `canonical target ${canon} not fetched (page budget)`); }
        else if (target.blocked) add('canonical-target-bad', 'fail', url, `canonical ${canon} is disallowed by robots.txt`);
        else if (target.status !== 200 || target.chain.length > 1) add('canonical-target-bad', 'fail', url, `canonical ${canon} answers ${target.chain.map((c) => c.status).join(' -> ')}`);
        else if (target.noindex) add('canonical-target-bad', 'fail', url, `canonical ${canon} is noindex`);
        if (findings.at(-1)?.rule === 'canonical-target-bad' && findings.at(-1).url === url) findings.at(-1).deps = [canon];
        // Read from the page's HTML: clearing it takes that HTML read again.
        if (inSitemap(rec)) { add('sitemap-url-canonicalized', 'warn', url, `sitemap lists a page whose canonical is ${canon}`); findings.at(-1).via = 'meta'; }
      }
    }

    // hreflang
    const self = rec.finalUrl;
    let hasSelf = false;
    const altSeen = new Set();
    for (const alt of h.hreflang) {
      if (!validHreflang(alt.lang)) { add('hreflang-invalid', 'fail', url, `hreflang="${alt.lang}" is not an ISO 639-1 language with an optional script and ISO 3166-1 alpha-2 region, so Google ignores it`, `${url}|${alt.lang}`); continue; }
      let target;
      try { target = new URL(alt.href, h.base).href; } catch { target = null; }
      if (!target || !httpUrl(target)) { add('hreflang-invalid', 'fail', url, `hreflang ${alt.lang} href "${alt.href}" is not an http(s) URL`, `${url}|${alt.lang}`); continue; }
      if (!/^https?:\/\//i.test(alt.href)) add('hreflang-relative', 'warn', url, `hreflang ${alt.lang} href "${alt.href}" is not a fully qualified URL`, `${url}|${alt.lang}`);
      target = mapUrl(target);
      if (target === self) { hasSelf = true; continue; }
      if (!sameOrigin(target) || altSeen.has(target)) continue;
      altSeen.add(target);
      const other = await getPage(target);
      if (!other) { hreflangUnchecked.add(target); budgetSkipped.add(target); continue; }
      if (other.blocked) { add('hreflang-target-blocked', 'fail', url, `${target} (${alt.lang}) is disallowed by robots.txt, so Google cannot confirm the pair`, `${url}|${target}`); findings.at(-1).deps = [target]; continue; }
      // An alternate that redirects is not the page it names; the return link is read from the redirect target.
      if (!other.error && other.chain?.length > 1) { add('hreflang-target-redirects', 'warn', url, `${target} (${alt.lang}) redirects to ${other.finalUrl}; list the final URL`, `${url}|${target}`); findings.at(-1).deps = [target]; continue; }
      if (!other.html) continue; // the target's own status is judged as its own page
      // A return entry counts only with a valid code, as Google reads it.
      if (!hreflangReturns.has(target)) {
        hreflangReturns.set(target, new Set(other.html.hreflang.flatMap((b) => { try { return validHreflang(b.lang) ? [mapUrl(new URL(b.href, other.html.base).href)] : []; } catch { return []; } })));
      }
      if (!hreflangReturns.get(target).has(self)) { add('hreflang-no-return', 'fail', url, `${target} (${alt.lang}) does not link back with hreflang; Google ignores one-way pairs`, `${url}|${target}`); findings.at(-1).deps = [target]; }
    }
    if (h.hreflang.length && !hasSelf) add('hreflang-no-self', 'warn', url, 'hreflang set does not include this page itself');

    // structured data
    if (h.jsonld.length) {
      const { types, errors } = jsonldTypes(h.jsonld);
      rec.jsonldTypes = types;
      for (const e of errors) add('jsonld-invalid', 'fail', url, `JSON-LD does not parse: ${e}`, `${url}|${e.split(':')[0]}`);
      if (!errors.length && !types.length && h.jsonld.some((b) => b.trim())) add('jsonld-no-type', 'warn', url, 'JSON-LD has no @type');
    }
  };

  // Judging a page can fetch its canonical or hreflang targets; judge those too,
  // so every fetched page gets the same checks.
  const judged = new Set();
  const hreflangUnchecked = new Set(); // hreflang targets past the fetch budget
  const hreflangReturns = new Map(); // hreflang target -> the URLs its valid entries name
  const budgetSkipped = new Set(); // canonical, hreflang and redirect targets past the fetch budget
  const overBudget = new Set(); // redirect targets past the fetch budget
  for (let pending = [...pages.values()]; pending.length; pending = [...pages.values()].filter((r) => !judged.has(r.url))) {
    for (const rec of pending) {
      judged.add(rec.url);
      await judge(rec);
    }
  }
  if (hreflangUnchecked.size) limits.push(`${hreflangUnchecked.size} hreflang target(s) past the fetch budget were not checked for return links: ${[...hreflangUnchecked].slice(0, 5).join(', ')}`);
  if (overBudget.size) limits.push(`${overBudget.size} redirect target(s) past the fetch budget were not checked: ${[...overBudget].slice(0, 5).join(', ')}`);
  // Targets left unchecked by the budget make the run as partial as a cut-off crawl.
  if (budgetSkipped.size) { truncated = true; limits.push(`Fetch budget (--max-pages + 50) ran out while checking canonical, hreflang and redirect targets: ${budgetSkipped.size} not checked.`); }
  if (bigPages.size) limits.push(`${bigPages.size} page(s) over ${MAX_BYTES / 1024 / 1024} MB were checked up to the cut, where Google stops reading: ${[...bigPages].slice(0, 5).join(', ')}`);

  // A complete run read the start page itself: HTTP 200, no redirect, HTML (not 206 or 204).
  const startOk = Boolean(startRec && !startRec.blocked && startRec.status === 200 && startRec.chain.length === 1 && startRec.html);
  if (needsPublicOrigin) add('needs-public-origin', 'fail', start.href, leftLocal
    ? `the local start URL ${requested.href} redirects to ${start.href}, off this machine; rerun with --public-origin <production origin> to stay on the preview`
    : 'local run, but robots.txt, the sitemap or canonical URLs name another origin; rerun with --public-origin <production origin> so those pages are checked here');
  const complete = startOk && !needsPublicOrigin;

  // site-wide findings
  const canonicalPages = [...pages.values()].filter((r) => r.indexable && (!canonicalOf(r) || canonicalOf(r) === r.finalUrl));
  const groupBy = (items, key) => items.reduce((m, r) => { const k = key(r); if (k) (m.get(k) ?? m.set(k, []).get(k)).push(r.url); return m; }, new Map());
  for (const [title, urls] of groupBy(canonicalPages, (r) => r.html.titles[0])) {
    if (urls.length > 1) { add('title-duplicate', 'warn', urls[0], `${urls.length} pages share the title "${title}": ${urls.join(', ')}`, title); findings.at(-1).urls = urls; }
  }
  for (const [desc, urls] of groupBy(canonicalPages, (r) => r.html.descriptions[0]?.trim())) {
    if (urls.length > 1) { add('description-duplicate', 'warn', urls[0], `${urls.length} pages share one meta description: ${urls.join(', ')}`, desc); findings.at(-1).urls = urls; }
  }
  // An empty sitemap still answers "is this page listed": no.
  if (sitemapsRead && !list) {
    // A fact about a fetched page, true however far the crawl got.
    // Only when every sitemap file was read: an unread file may list the page.
    if (sitemapComplete) for (const r of canonicalPages) {
      if (!inSitemap(r)) add('not-in-sitemap', 'warn', r.url, 'indexable page missing from the sitemap');
    }
    for (const loc of sitemapUrls) {
      const r = pages.get(loc);
      if (r?.indexable && loc !== startRec?.url && loc !== startRec?.finalUrl && !linkedFrom.has(loc) && !linkedFrom.has(r.finalUrl)) {
        add('orphan', truncated ? 'info' : 'warn', loc, 'in the sitemap but no crawled page links to it');
      }
    }
  }
  if (!startOk) add('start-unreadable', 'fail', start.href, startRec?.blocked ? 'robots.txt disallows the start URL for Googlebot' : `start page was not read as HTML with HTTP 200 (got ${startRec?.status ?? startRec?.error ?? 'nothing: not fetched'})`);

  const order = { fail: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.rule.localeCompare(b.rule) || a.id.localeCompare(b.id));
  const seen = new Set();
  const unique = findings.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
  const summary = { fail: 0, warn: 0, info: 0 };
  unique.forEach((f) => summary[f.severity]++);

  return {
    tool: 'seo-check',
    version: 2,
    mode: list ? 'urls' : 'crawl',
    url: start.href,
    requestedUrl: requested.href,
    startedAt,
    finishedAt: new Date().toISOString(),
    complete,
    truncated,
    fetches,
    publicOrigin,
    robots: { status: robotsRes.status, sitemaps: robots?.sitemaps ?? [] },
    sitemap: { files: sitemapFiles, read: sitemapsRead, complete: sitemapComplete, urls: sitemapUrls.size, list: [...sitemapUrls] },
    // Same-origin URLs some crawled page links to: diff uses it to tell a removed link from an unchecked page.
    linked: [...linkedFrom.keys()],
    pages: [...pages.values()].map((r) => ({
      url: r.url,
      blocked: r.blocked,
      status: r.status ?? null,
      finalUrl: r.finalUrl ?? null,
      redirects: r.chain ? r.chain.length - 1 : 0,
      stopped: r.stopped ?? null,
      html: Boolean(r.html),
      truncated: Boolean(r.truncated),
      noindex: Boolean(r.noindex),
      indexable: Boolean(r.indexable),
      inSitemap: inSitemap(r),
      title: r.html?.titles[0] ?? null,
      canonical: canonicalOf(r),
      alternates: (r.html?.hreflang ?? []).flatMap((a) => { try { return [mapUrl(new URL(a.href, r.html.base).href)]; } catch { return []; } }),
      jsonldTypes: r.jsonldTypes ?? [],
    })),
    summary,
    findings: unique,
    limits,
  };
}

function printSummary(report, stream) {
  const byRule = new Map();
  for (const f of report.findings) {
    const k = `${f.severity}\t${f.rule}`;
    byRule.set(k, (byRule.get(k) ?? 0) + 1);
  }
  stream.write(`seo-check ${report.url}: ${report.pages.length} URLs, ${report.summary.fail} fail, ${report.summary.warn} warn, ${report.summary.info} info${report.truncated ? ' (crawl truncated)' : ''}${report.complete ? '' : ' (INCOMPLETE)'}\n`);
  for (const [k, n] of byRule) stream.write(`  ${k.replace('\t', '  ')}  x${n}\n`);
}

// ---------- diff mode ----------

const canonicalUrl = (u) => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).href; } catch { return u; } };

function normalize(report, label) {
  if (report?.tool === 'seo-check') {
    // Every URL the run fetched and got an answer from. A finding counts as fixed
    // only if the later run fetched its URL again (a robots.txt block is not a fetch).
    const origin = new URL(report.url).origin;
    const covered = new Set([report.url, origin, origin + '/robots.txt', ...(report.sitemap?.files ?? [])]);
    const coveredHtml = new Set(); // pages whose whole HTML was read, so HTML findings were rechecked
    for (const p of report.pages ?? []) {
      if (p.blocked || p.status === null) continue;
      covered.add(p.url);
      // A redirect the guard stopped never fetched its target.
      if (p.finalUrl && !p.stopped) covered.add(p.finalUrl);
      if (p.html && p.redirects === 0) coveredHtml.add(p.url);
    }
    for (const p of report.pages ?? []) {
      if (!p.blocked && p.redirects > 0 && p.status === 200 && !p.stopped && coveredHtml.has(p.finalUrl)) coveredHtml.add(p.url);
    }
    // A start URL that redirects was fetched too, and its redirect chain judged; the crawl started where it landed.
    const requested = report.requestedUrl ?? report.url;
    if (report.complete && requested !== report.url) {
      covered.add(requested);
      if (coveredHtml.has(report.url)) coveredHtml.add(requested);
    }
    return {
      kind: 'seo-check', version: report.version ?? 1, valid: report.complete, url: report.url, requested: report.requestedUrl ?? report.url,
      mode: report.mode ?? 'crawl', truncated: Boolean(report.truncated), covered, coveredHtml,
      pages: new Map((report.pages ?? []).map((p) => [p.url, p])),
      refs: new Map((report.pages ?? []).map((p) => [p.url, new Set([p.canonical, ...(p.alternates ?? [])].filter(Boolean))])),
      linked: new Set(report.linked ?? []),
      sitemapComplete: report.sitemap?.complete === true, sitemapFiles: new Set(report.sitemap?.files ?? []),
      sitemapList: new Set(report.sitemap?.list ?? []),
      findings: report.findings.filter((f) => f.severity !== 'info'), scores: {},
      // A fail or warn can drop to info when a run is truncated (orphan); that is not a fix.
      infoIds: new Set(report.findings.filter((f) => f.severity === 'info').map((f) => f.id)),
    };
  }
  if (report?.tool === 'geo-audit') {
    const findings = [];
    const scores = {};
    const unverified = new Set(); // dimensions with a check that could not run
    for (const d of report.dimensions ?? []) {
      scores[d.key] = d.score;
      for (const e of d.evidence ?? []) {
        // "not assessable" (too few pages sampled) is as unverified as "unverified".
        if (e.status === 'unverified' || /not assessable/i.test(e.message ?? '')) unverified.add(d.key);
        if (e.status !== 'fail' && e.status !== 'warn') continue;
        // Counts inside messages change as a round makes progress; the id ignores them.
        findings.push({ id: `geo:${d.key}|${e.message.replace(/\d+/g, '#')}`, rule: `geo:${d.key}`, severity: e.status, url: report.url, message: e.message });
      }
    }
    // willaicite exits 0 and prints a score even when the page answered 404 or
    // never answered; pagesAudited lists only pages that answered 200.
    const url = canonicalUrl(report.url);
    const audited = (report.pagesAudited ?? []).map(canonicalUrl);
    const reached = report.finalUrl !== null && audited.includes(url);
    return { kind: 'geo-audit', version: 1, valid: reached && report.overallScore !== null, url, requested: url, findings, scores, unverified, audited: new Set(audited) };
  }
  throw new Error(`${label} is neither a seo-check nor a geo-audit report`);
}

function diff(beforePath, afterPath) {
  const a = normalize(JSON.parse(readFileSync(beforePath, 'utf8')), beforePath);
  const b = normalize(JSON.parse(readFileSync(afterPath, 'utf8')), afterPath);
  const refuse = (msg) => { process.stderr.write(`${msg}\n`); return 2; };
  if (a.kind !== b.kind) return refuse(`cannot compare a ${a.kind} report with a ${b.kind} report`);
  if (a.version !== b.version) return refuse(`reports come from different seo-check versions (${a.version} and ${b.version}); rerun both with the same script`);
  // The requested URL identifies the run; where it lands may be what the round fixed.
  if (a.requested !== b.requested) return refuse(`different start URLs: ${a.requested} vs ${b.requested}`);
  for (const [r, p] of [[a, beforePath], [b, afterPath]]) {
    if (!r.valid) return refuse(`${p} is incomplete (page not reached with HTTP 200, or nothing verified); not comparable`);
  }
  if (a.kind === 'seo-check' && new URL(a.url).origin !== new URL(b.url).origin) {
    return refuse(`the earlier run crawled ${new URL(a.url).origin} and the later one ${new URL(b.url).origin}; pages on different origins can't be matched. Take a new baseline on the new origin`);
  }
  const before = new Map(a.findings.map((f) => [f.id, f]));
  const after = new Map(b.findings.map((f) => [f.id, f]));
  const gone = a.findings.filter((f) => !after.has(f.id));
  // What the later run could not settle. A confirmed regression still exits 1; otherwise these exit 2.
  const notes = [];
  if (a.kind === 'seo-check' && b.truncated && !a.truncated) {
    notes.push(`${afterPath} stopped at its page budget and ${beforePath} did not; rerun the later check with a higher --max-pages\n`);
  }
  const unsettled = new Set();
  // How to recheck: a truncated run needs a bigger budget (listed URLs count against it too),
  // a --urls run needs the URLs on its list (--include doesn't combine with --urls).
  const recheck = b.truncated ? `rerun ${a.truncated ? 'both checks' : 'the later check'} with a higher --max-pages`
    : b.mode === 'urls' ? 'add them to the --urls list of the later check'
      : 'rerun the later check with --include <file listing them>';

  if (b.kind === 'geo-audit') {
    // willaicite gives its checks no ids and picks its extra pages itself, so a failure that
    // vanished counts as fixed only if the later run sampled every page the earlier one did and
    // could verify every check in that dimension.
    const sampleShrank = [...a.audited].some((u) => !b.audited.has(u));
    const unsure = gone.filter((f) => b.unverified.has(f.rule.slice(4)) || sampleShrank);
    if (unsure.length) {
      unsure.forEach((f) => unsettled.add(f));
      notes.push(`${unsure.length} finding(s) disappeared while ${sampleShrank ? 'the later audit sampled different pages' : 'their dimension has checks the later run could not verify'}. Not counted as fixed; rerun the later audit:\n${unsure.map((f) => `  ${f.rule}  ${f.message}\n`).join('')}`);
    }
  }

  if (b.kind === 'seo-check') {
    // Findings read from a page's HTML need that page's HTML read again; status and
    // redirect findings only need it fetched.
    const statusRule = /^(http-error|http-no-content|fetch-error|redirect-chain|sitemap-|robots-|start-unreadable|needs-public-origin|linked-url-|listed-url-)/;
    // Sitemap-membership findings need the later run to have read every sitemap file, in a full crawl.
    const membershipRule = /^(not-in-sitemap|orphan|sitemap-url-|sitemap-bad-url$|sitemap-foreign-url$)/;
    // Findings about one sitemap entry are settled once a complete later sitemap no longer lists it.
    const entryRule = /^(sitemap-url-|sitemap-bad-url$|sitemap-foreign-url$)/;
    // Findings about a sitemap file are settled once a complete later sitemap no longer references the file.
    const fileRule = /^sitemap-(missing|unreachable|invalid|too-large|empty|redirect)$/;
    // A broken URL is settled once a full, untruncated later crawl neither links to it nor lists it.
    const brokenRule = /^(http-error|fetch-error|http-no-content)$/;
    const fullCrawl = b.mode === 'crawl' && !b.truncated && b.sitemapComplete;
    const coverage = (f) => (statusRule.test(f.rule) && f.via !== 'meta' ? b.covered : b.coveredHtml);
    // A cross-page finding's target needs its HTML read again, unless the source page no longer points at it.
    const depChecked = (f, u) => b.coveredHtml.has(u) || !b.refs.get(f.url)?.has(u);
    const settled = (f) => {
      if (b.infoIds.has(f.id)) return false;
      if (membershipRule.test(f.rule) && (!b.sitemapComplete || b.mode !== 'crawl')) return false;
      if (entryRule.test(f.rule) && !b.sitemapList.has(f.url)) return true;
      if (fileRule.test(f.rule) && b.sitemapComplete && !b.sitemapFiles.has(f.url)) return true;
      if (brokenRule.test(f.rule) && fullCrawl && !b.covered.has(f.url) && !b.linked.has(f.url) && !b.sitemapList.has(f.url)) return true;
      return (f.urls ?? [f.url]).every((u) => coverage(f).has(u)) && (f.deps ?? []).every((u) => depChecked(f, u));
    };
    const unchecked = gone.filter((f) => !settled(f));
    if (unchecked.length) {
      unchecked.forEach((f) => unsettled.add(f));
      const lines = unchecked.map((f) => {
        const missing = [...(f.urls ?? [f.url]).filter((u) => !coverage(f).has(u)), ...(f.deps ?? []).filter((u) => !depChecked(f, u))];
        return `  ${f.rule}  ${missing.length ? missing.join(', ') : `${f.url} (needs a full crawl that reads every sitemap file)`}\n`;
      });
      notes.push(`${unchecked.length} finding(s) disappeared without the later run rechecking their URL (robots-blocked, past the page budget, no longer HTML, a --urls run, or a sitemap not read in full). Not counted as fixed; check those URLs and, where they still exist, ${recheck}:\n${lines.join('')}`);
    }
  }

  // A page that was indexable and its own canonical must stay indexable, or hand its place to a
  // page that is: a redirect or canonical to an indexable page on the site is consolidation.
  const lost = [];
  if (b.kind === 'seo-check') {
    const indexableAfter = (u) => b.pages.get(u)?.indexable && (!b.pages.get(u).canonical || b.pages.get(u).canonical === b.pages.get(u).finalUrl);
    // Indexable itself, or indexable and canonical to a page that is.
    const consolidates = (u) => indexableAfter(u) || Boolean(b.pages.get(u)?.indexable && b.pages.get(u).canonical && indexableAfter(b.pages.get(u).canonical));
    // Only a full, untruncated crawl can show that a page is gone; otherwise its state is unknown.
    const unknown = [];
    // A same-origin canonical target the later run never fetched (page budget, a --urls list) is
    // unknown, not a page that stopped being indexable. A full crawl fetches every one; one on another
    // origin is never fetched by any run, so pointing there stays a loss.
    const sameOrigin = (u) => { try { return new URL(u).origin === new URL(b.url).origin; } catch { return false; } };
    const unchecked = (u) => !b.pages.has(u) && sameOrigin(u) && (b.mode !== 'crawl' || b.truncated);
    const uncheckedCanonical = (r) => Boolean(r?.indexable && r.canonical && r.canonical !== r.finalUrl && unchecked(r.canonical));
    const unknownTargets = new Set();
    for (const p of a.pages.values()) {
      if (!p.indexable || (p.canonical && p.canonical !== p.finalUrl)) continue;
      const q = b.pages.get(p.url);
      // The start URL now redirects: consolidation if it lands on an indexable page.
      if (!q && p.url === b.requested && b.url !== b.requested) {
        if (consolidates(b.url)) continue;
        if (uncheckedCanonical(b.pages.get(b.url))) unknownTargets.add(b.pages.get(b.url).canonical);
        else lost.push([p.url, `now redirects to ${b.url}, which is not an indexable page here`]);
        continue;
      }
      if (!q) {
        if (b.mode === 'crawl' && !b.truncated) lost.push([p.url, 'no longer found by the crawl (not linked from crawled pages or listed in the sitemap)']);
        else unknown.push(p.url);
        continue;
      }
      if (q.indexable && (!q.canonical || q.canonical === q.finalUrl)) continue;
      if (q.redirects > 0 && !q.stopped && consolidates(q.finalUrl)) continue;
      if (q.indexable && q.canonical && indexableAfter(q.canonical)) continue;
      // A redirect's own record holds the response it landed on. That page is indexable when it
      // answered 200 with HTML and no noindex, so only a canonical it names can be left unchecked.
      if (q.redirects > 0 && !q.stopped && q.status === 200 && q.html && !q.noindex) {
        if (!q.canonical || q.canonical === q.finalUrl || indexableAfter(q.canonical)) continue;
        if (unchecked(q.canonical)) { unknownTargets.add(q.canonical); continue; }
      }
      if (q.redirects === 0 && uncheckedCanonical(q)) { unknownTargets.add(q.canonical); continue; }
      lost.push([p.url, q.blocked ? 'now blocked by robots.txt' : q.redirects > 0 ? `now redirects to ${q.finalUrl}, which is not an indexable page here` : q.noindex ? 'now noindex' : q.canonical && q.canonical !== q.finalUrl ? `now canonical to ${q.canonical}, which is not an indexable page here` : `now answers ${q.status ?? 'nothing'}${q.html ? '' : ' without HTML'}`]);
    }
    if (unknown.length) {
      notes.push(`${unknown.length} page(s) indexable in ${beforePath} were not checked by the later run (${b.truncated ? 'it stopped at its page budget' : 'a --urls run'}), so the gate can't tell whether they are still indexable; ${recheck}:\n${unknown.map((u) => `  ${u}\n`).join('')}`);
    }
    // A target already in the list above needs no second mention.
    const listed = new Set(unknown);
    const targets = [...unknownTargets].filter((u) => !listed.has(u));
    if (targets.length) {
      notes.push(`Pages indexable in ${beforePath} now redirect to, or name as canonical, ${targets.length} page(s) the later run did not check (${b.truncated ? 'it stopped at its page budget' : 'a --urls run'}), so the gate can't tell whether they still land on an indexable page; ${recheck}:\n${targets.map((u) => `  ${u}\n`).join('')}`);
    }
  }

  // A duplicate group that keeps its id but gains pages is a regression for those pages.
  const grown = b.findings.filter((f) => f.urls && before.get(f.id)?.urls).map((f) => { const had = new Set(before.get(f.id).urls); return { f, extra: f.urls.filter((u) => !had.has(u)) }; }).filter((g) => g.extra.length);
  const fixed = gone.filter((f) => !unsettled.has(f));
  const added = b.findings.filter((f) => !before.has(f.id));
  const changed = b.findings.filter((f) => before.has(f.id) && before.get(f.id).message !== f.message);
  const rank = { warn: 1, fail: 2 };
  const worse = b.findings.filter((f) => before.has(f.id) && rank[f.severity] > rank[before.get(f.id).severity]);
  const unchanged = b.findings.length - added.length;
  const out = process.stdout;
  out.write(`${a.kind} diff (fail and warn only): ${fixed.length} fixed${unsettled.size ? ` (${unsettled.size} more gone but not rechecked)` : ''}, ${added.length} new, ${changed.length} changed wording, ${unchanged} still present${lost.length ? `, ${lost.length} indexable page(s) lost` : ''}\n`);
  for (const f of fixed) out.write(`  FIXED  ${f.severity}  ${f.rule}  ${f.url}  ${f.message}\n`);
  for (const f of added) out.write(`  NEW    ${f.severity}  ${f.rule}  ${f.url}  ${f.message}\n`);
  for (const f of changed) out.write(`  CHANGED  ${f.rule}  "${before.get(f.id).message}" -> "${f.message}"\n`);
  for (const f of worse) out.write(`  WORSE  ${before.get(f.id).severity} -> ${f.severity}  ${f.rule}  ${f.url}  ${f.message}\n`);
  for (const [u, why] of lost) out.write(`  LOST   ${u}  ${why}\n`);
  const drops = [];
  for (const key of new Set([...Object.keys(a.scores), ...Object.keys(b.scores)])) {
    const x = a.scores[key] ?? null;
    const y = b.scores[key] ?? null;
    if (x === y) continue;
    out.write(`  SCORE  ${key}: ${x ?? 'not verified'} -> ${y ?? 'not verified'}\n`);
    if (x !== null && (y === null || y < x)) drops.push(key);
  }
  for (const { f, extra } of grown) out.write(`  GREW   ${f.severity}  ${f.rule}  now also ${extra.join(', ')}\n`);
  for (const n of notes) process.stderr.write(n);
  if (added.length || worse.length || lost.length || drops.length || grown.length) return 1;
  return notes.length ? 2 : 0;
}

// ---------- main ----------

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { process.stdout.write(usage()); return argv.length ? 0 : 2; }
  if (argv[0] === 'diff') {
    if (argv.length !== 3) { process.stderr.write(usage()); return 2; }
    return diff(argv[1], argv[2]);
  }
  let opts;
  try { opts = parseArgs(argv); } catch (err) { process.stderr.write(`error: ${err.message}\n${usage()}`); return 2; }
  const report = await check(opts);
  const json = JSON.stringify(report, null, 2) + '\n';
  if (opts.out) {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, json);
    printSummary(report, process.stdout);
  } else {
    process.stdout.write(json);
    printSummary(report, process.stderr);
  }
  if (!report.complete) return 2;
  return report.summary.fail ? 1 : 0;
}

// Set exitCode and let Node exit on its own: process.exit() right after fetch()
// trips a libuv assertion on Node 24 for Windows.
main().then((code) => { process.exitCode = code; }, (err) => { process.stderr.write(`seo-check failed: ${err?.stack ?? err}\n`); process.exitCode = 2; });
