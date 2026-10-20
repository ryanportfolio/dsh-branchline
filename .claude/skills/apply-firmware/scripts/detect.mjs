#!/usr/bin/env node
// Read-only firmware gap report for apply-firmware.
// Compares a target folder against a Harness Firmware template clone and
// classifies every firmware-layer path. Writes nothing.
//
// usage: node detect.mjs --target <dir> --template <template-clone> [--json]
// exit 2: no usable template: not a clone, or a manifest that is unreadable, not version 1,
// or has an unknown top-level key.
// exit 3: the target's origin is the template itself (preflight stop); the report still prints.
// Clone the template with `git clone --filter=blob:none` (full history, no
// blobs) so stale-copy detection can see every historical blob hash.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = resolve(opt('--target') ?? '.');
const template = opt('--template') && resolve(opt('--template'));
const asJson = args.includes('--json');
if (!template || !existsSync(join(template, 'CLAUDE.md'))) {
  console.error('detect.mjs: --template must point at a Harness Firmware clone');
  process.exit(2);
}

const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
};

// The template's .agents/template-manifest.json is the source of truth for which paths
// a project gets (projectPaths) and which stay in the template (templateOnly). Templates
// from before the manifest fall back to the old fixed list and the generator script.
// Its spec (docs/specs/2026-10-01-template-manifest-design.md) stops every consumer on an
// unreadable manifest, a version other than 1, or an unknown top-level key.
const MANIFEST_KEYS = ['version', 'template', 'requiredFiles', 'projectPaths', 'templateOnly', 'readmeStub', 'skills'];
const manifestFile = join(template, '.agents/template-manifest.json');
const manifest = existsSync(manifestFile) ? readJson(manifestFile) : null;
if (existsSync(manifestFile)) {
  const stop = (why) => { console.error(`detect.mjs: ${manifestFile}: ${why}`); process.exit(2); };
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) stop('not a readable JSON object');
  if (manifest.version !== 1) stop(`version ${JSON.stringify(manifest.version)} is not supported; expected 1`);
  const unknown = Object.keys(manifest).filter((k) => !MANIFEST_KEYS.includes(k));
  if (unknown.length) stop(`unknown top-level key ${unknown.join(', ')}; this detect.mjs is older than the template`);
}
const LAYER_ROOTS = manifest?.projectPaths ?? [
  'CLAUDE.md', 'AGENTS.md', '.mcp.json', '.gitattributes', '.gitignore',
  '.claude', '.agents', '.codex', 'scripts/lib',
];
const NEVER = [
  /^\.claude\/settings\.local\.json$/, /^\.claude\/worktrees\//, /^\.tmp/,
  /(^|\/)\.localhost-.*\.pem$/, /(^|\/)node_modules\//,
];
const KERNEL = new Set(['CLAUDE.md', 'AGENTS.md']);
const JSON_MERGE = new Set(['.claude/settings.json', '.mcp.json', '.agents/skill-modes.json']);
const LINE_UNION = new Set(['.gitignore', '.gitattributes']);
// The project's own record of skills it removed; the template ships it empty.
const PROJECT_OWNED = new Set(['.agents/removed-skills.json']);

const templateOnly = manifest?.templateOnly ?? (() => {
  const sh = join(template, 'bootstrap/new-claude-project.sh');
  if (!existsSync(sh)) return [];
  const m = readFileSync(sh, 'utf8').match(/TEMPLATE_ONLY_PATHS=\(([\s\S]*?)\)/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
})();

// Skills the project recorded as removed are not re-added, except ones the template
// requires.
const required = new Set(manifest?.skills?.required ?? []);
const recorded = readJson(join(target, '.agents/removed-skills.json'))?.removed ?? [];
const removedSkills = new Set(recorded.filter((n) => !required.has(n)));
const excluded = (p) =>
  NEVER.some((re) => re.test(p)) ||
  templateOnly.some((t) => p === t || p.startsWith(t + '/'));

const posix = (p) => p.split(sep).join('/');
// Links are reported, never followed: a link loop cannot recurse, and a linked folder may lie
// outside the firmware layer.
const links = [];
function walk(root, rel) {
  const abs = join(root, rel);
  let st;
  try { st = lstatSync(abs); } catch { return []; }
  if (st.isSymbolicLink()) { links.push({ in: root === template ? 'template' : 'target', path: posix(rel) }); return []; }
  if (st.isFile()) return [posix(rel)];
  if (!st.isDirectory()) return [];
  return readdirSync(abs).flatMap((n) => {
    const r = `${rel}/${n}`;
    if (n === '.git' || excluded(posix(r))) return [];
    return walk(root, r);
  });
}
const layerFiles = (root) =>
  LAYER_ROOTS.flatMap((r) => walk(root, r)).filter((p) => !excluded(p));

const blob = (buf) =>
  createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const lf = (buf) => Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const hashes = (file) => {
  const b = readFileSync(file);
  return new Set([blob(b), blob(lf(b))]);
};

// Every blob hash each path has ever had on the template's default branch (the clone's HEAD).
// Unmerged branches do not count: a copy of an experimental file is not an unedited release.
const history = new Map();
try {
  const raw = execFileSync('git',
    ['-C', template, 'log', 'HEAD', '-z', '--format=', '--raw', '--no-abbrev', '--no-renames'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  // -z keeps paths unquoted (non-ASCII, quotes): each entry is ":<modes> <old> <new> <status>\0<path>\0".
  const parts = raw.split('\0');
  for (let i = 0; i < parts.length - 1; i++) {
    const m = parts[i].trim().match(/^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) \w+$/);
    if (!m) continue;
    const path = parts[++i];
    if (/^0+$/.test(m[1])) continue; // an all-zero hash is a deletion
    if (!history.has(path)) history.set(path, new Set());
    history.get(path).add(m[1]);
  }
} catch { /* non-git template: stale detection degrades to CONFLICT */ }

const modes = (() => {
  try { return JSON.parse(readFileSync(join(template, '.agents/skill-modes.json'), 'utf8')).skills ?? {}; }
  catch { return {}; }
})();
// A template folder under a skills root with no SKILL.md, no plugin manifest (smart-compact is a
// mod, not a skill) and no skill-modes entry is a leftover of a retired skill, such as
// writing-skills or humanizer. It is never added; a project copy of it is retired.
const leftovers = ['.claude/skills', '.agents/skills'].flatMap((r) => {
  const abs = join(template, r);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !Object.hasOwn(modes, d.name) &&
      !['SKILL.md', '.claude-plugin/plugin.json'].some((f) => existsSync(join(abs, d.name, f))))
    .map((d) => `${r}/${d.name}/`);
});

const sections = (text) =>
  new Map(text.replace(/\r\n/g, '\n').split(/^(?=## )/m).filter((s) => s.startsWith('## '))
    .map((s) => [s.split('\n')[0].slice(3).trim(), s.trim()]));

// Hook commands in a hooks.<Event> array of matcher groups.
const hookCommands = (groups) => groups.flatMap((g) => g?.hooks ?? []).map((h) => h?.command).filter(Boolean);

function jsonDiff(a, b, path = '', out = { add: [], conflict: [], arrayAdds: [], hookAdds: [] }) {
  for (const [k, tv] of Object.entries(b)) {
    const p = path ? `${path}.${k}` : k;
    if (!(k in a)) { out.add.push(p); continue; }
    const av = a[k];
    if (path === 'hooks' && Array.isArray(tv) && Array.isArray(av)) {
      // A template hook is present when its command is, whatever its matcher, timeout or other fields.
      const have = new Set(hookCommands(av));
      const missing = hookCommands(tv).filter((c) => !have.has(c));
      if (missing.length) out.hookAdds.push({ path: p, commands: missing });
    } else if (Array.isArray(tv) && Array.isArray(av)) {
      const have = new Set(av.map((x) => JSON.stringify(x)));
      const missing = tv.filter((x) => !have.has(JSON.stringify(x)));
      if (missing.length) out.arrayAdds.push({ path: p, count: missing.length });
    } else if (tv && typeof tv === 'object' && av && typeof av === 'object') {
      jsonDiff(av, tv, p, out);
    } else if (JSON.stringify(av) !== JSON.stringify(tv)) {
      out.conflict.push({ path: p, local: av, template: tv });
    }
  }
  return out;
}

// ---- environment facts ----
const git = (...a) => {
  try {
    return execFileSync('git', ['-C', target, ...a],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
};
const isRepo = git('rev-parse', '--is-inside-work-tree') === 'true';
const env = {
  target,
  isGitRepo: isRepo,
  gitTopLevel: isRepo ? git('rev-parse', '--show-toplevel') : null,
  origin: isRepo ? git('remote', 'get-url', 'origin') : null,
  starterRemote: isRepo ? git('remote', 'get-url', 'starter') : null,
  dirtyEntries: isRepo ? (git('status', '--porcelain') ?? '').split('\n').filter(Boolean).length : null,
};
// A non-git template has no HEAD; a shallow clone has partial history, so stale detection degrades.
const tgit = (...a) => {
  try {
    return execFileSync('git', ['-C', template, ...a],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
};
env.templateHead = tgit('rev-parse', 'HEAD');
env.templateShallow = tgit('rev-parse', '--is-shallow-repository') === 'true';
env.isTemplateItself = /ryanportfolio\/(Harness-Firmware|claude-starter)(\.git)?$/i.test(env.origin ?? '');

// ---- classify ----
const report = { env, leftovers, add: [], stale: [], merge: [], edited: [], ok: [], localOnly: [], removed: [], retired: [], symlinks: links };
const tplFiles = layerFiles(template);
const tplSet = new Set(tplFiles);

for (const p of tplFiles) {
  const t = join(template, p);
  const l = join(target, p);
  const anySkill = p.match(/^\.(?:claude|agents)\/skills\/([^/]+)\//)?.[1];

  if (leftovers.some((d) => p.startsWith(d))) {
    if (!existsSync(l)) continue;
    const lh = hashes(l);
    const known = [...hashes(t)].some((h) => lh.has(h)) || [...lh].some((h) => history.get(p)?.has(h));
    (known ? report.retired : report.localOnly).push(p); // an edited copy is the project's own
    continue;
  }
  if (!existsSync(l) && removedSkills.has(anySkill)) { report.removed.push(p); continue; }
  if (!existsSync(l)) { report.add.push(p); continue; }
  if (PROJECT_OWNED.has(p)) { report.ok.push(p); continue; }
  const lh = hashes(l);
  if ([...hashes(t)].some((h) => lh.has(h))) { report.ok.push(p); continue; }

  if (KERNEL.has(p)) {
    const text = readFileSync(l, 'utf8');
    const ls = sections(text);
    const ts = sections(readFileSync(t, 'utf8'));
    report.merge.push({
      path: p, kind: 'sections',
      missing: [...ts.keys()].filter((h) => !ls.has(h)),
      differs: [...ts.keys()].filter((h) => ls.has(h) && ls.get(h) !== ts.get(h)),
      localOnly: [...ls.keys()].filter((h) => !ts.has(h)),
      fillIn: (text.match(/FILL IN/g) ?? []).length,
    });
  } else if (JSON_MERGE.has(p)) {
    try {
      const d = jsonDiff(JSON.parse(readFileSync(l, 'utf8')), JSON.parse(readFileSync(t, 'utf8')));
      // A SKIPPED skill gets no registry entry.
      if (p === '.agents/skill-modes.json') d.add = d.add.filter((k) => !removedSkills.has(k.replace(/^skills\./, '')));
      report.merge.push({ path: p, kind: 'json', ...d });
    } catch (e) {
      report.edited.push({ path: p, note: `unparseable local JSON: ${e.message}` });
    }
  } else if (LINE_UNION.has(p)) {
    const have = new Set(readFileSync(l, 'utf8').split(/\r?\n/).map((s) => s.trim()));
    const missing = readFileSync(t, 'utf8').split(/\r?\n/)
      .map((s) => s.trim()).filter((s) => s && !s.startsWith('#') && !have.has(s));
    report.merge.push({ path: p, kind: 'lines', missing });
  } else if (p.startsWith('.claude/reference/')) {
    report.ok.push(p); // project knowledge: present means keep, never overwrite
  } else if ([...lh].some((h) => history.get(p)?.has(h))) {
    report.stale.push(p); // byte-identical to an older template version
  } else {
    report.edited.push({ path: p });
  }
}
// A local file the template once shipped and has since deleted is retired firmware,
// unless the project edited it (then it is the project's own).
for (const p of layerFiles(target).filter((f) => !tplSet.has(f))) {
  const old = history.get(p);
  if (old && [...hashes(join(target, p))].some((h) => old.has(h))) report.retired.push(p);
  else report.localOnly.push(p);
}

// ---- skill dependencies ----
// The project's skills once applied: present, plus ADD, minus SKIPPED. Each skills.dependencies
// need missing from that set is a gap, and so is a required skill the project recorded as removed
// (it is kept or added anyway, so the record is wrong).
const SKILL_MD = /^\.(?:claude|agents)\/skills\/([^/]+)\/SKILL\.md$/;
const present = ['.claude/skills', '.agents/skills'].flatMap((r) =>
  existsSync(join(target, r)) ? readdirSync(join(target, r)).filter((n) => existsSync(join(target, r, n, 'SKILL.md'))) : []);
const skipped = new Set(report.removed.map((p) => p.split('/')[2]));
const finalSkills = new Set([...present, ...report.add.map((p) => p.match(SKILL_MD)?.[1]).filter(Boolean)]
  .filter((n) => !skipped.has(n)));
report.dependencyGaps = {
  missing: Object.entries(manifest?.skills?.dependencies ?? {}).filter(([s]) => finalSkills.has(s))
    .flatMap(([skill, needs]) => needs.filter((n) => !finalSkills.has(n))
      .map((need) => ({ skill, need, recordedRemoved: recorded.includes(need) }))),
  requiredRemoved: [...required].filter((n) => recorded.includes(n)),
};

// ---- output ----
const code = env.isTemplateItself ? 3 : 0;
if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(code); }

const bySkill = (list) => {
  const groups = new Map();
  const rest = [];
  for (const p of list) {
    const m = p.match(/^(\.claude|\.agents)\/skills\/([^/]+)\//);
    if (!m) { rest.push(p); continue; }
    const k = `${m[1]}/skills/${m[2]}/`;
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  return [...rest, ...[...groups].map(([k, n]) => {
    const total = tplFiles.filter((f) => f.startsWith(k)).length;
    return total ? `${k} (${n}/${total} files${n === total ? ', whole skill' : ''})` : `${k} (${n} files)`;
  })];
};
const line = (s) => console.log(`  ${s}`);
const list = (xs) => (xs.length ? xs.join(' | ') : '-');
console.log(`target      ${env.target}`);
console.log(`git         ${env.isGitRepo ? `yes, top ${env.gitTopLevel}, ${env.dirtyEntries} dirty entries` : 'no'}`);
console.log(`origin      ${env.origin ?? '-'}${env.isTemplateItself ? '  <-- THIS IS THE TEMPLATE, STOP' : ''}`);
console.log(`starter     ${env.starterRemote ?? '-'}`);
console.log(`template    ${env.templateHead?.slice(0, 12) ?? 'not a git clone, so every edited file reads as CONFLICT'}`);
if (env.templateShallow) console.log('WARNING     template clone is shallow: old copies may read as CONFLICT; re-clone with --filter=blob:none and no --depth');
console.log(`\nADD (missing, copy as-is): ${report.add.length}`);
bySkill(report.add).forEach(line);
if (leftovers.length) console.log(`template leftovers ignored (retired skill folders, never added): ${leftovers.join(' ')}`);
console.log(`\nUPDATE-STALE (unmodified older template copy, safe to refresh): ${report.stale.length}`);
bySkill(report.stale).forEach(line);
console.log(`\nMERGE (structured, additive): ${report.merge.length}`);
for (const m of report.merge) {
  if (m.kind === 'sections') {
    line(`${m.path}: missing sections [${list(m.missing)}]; differing [${list(m.differs)}]; project-only [${list(m.localOnly)}]; FILL IN markers ${m.fillIn}`);
  } else if (m.kind === 'json') {
    line(`${m.path}: add keys [${list(m.add)}]; array additions [${list(m.arrayAdds.map((a) => `${a.path} +${a.count}`))}]; ` +
      (m.path === '.claude/settings.json' ? `hook additions [${list(m.hookAdds.flatMap((h) => h.commands.map((c) => `${h.path}: ${c}`)))}]; ` : '') +
      `scalar conflicts [${list(m.conflict.map((c) => c.path))}]`);
  } else {
    line(`${m.path}: append ${m.missing.length} line(s) [${list(m.missing)}]`);
  }
}
console.log(`\nCONFLICT (differs from every template version, ask): ${report.edited.length}`);
report.edited.forEach((e) => line(e.note ? `${e.path}: ${e.note}` : e.path));
console.log(`\nRETIRED (unedited copy of a file the template deleted or keeps only as a leftover, offer removal): ${report.retired.length}`);
bySkill(report.retired).forEach(line);
console.log(`\nSKIPPED (skill recorded in .agents/removed-skills.json): ${report.removed.length}`);
bySkill(report.removed).forEach(line);
const gaps = report.dependencyGaps;
console.log(`\nDEPENDENCY GAPS (a skill the project will have needs one it will not): ${gaps.missing.length + gaps.requiredRemoved.length}`);
gaps.missing.forEach((g) => line(`${g.skill} needs ${g.need}${g.recordedRemoved ? ' (recorded as removed)' : ''}`));
gaps.requiredRemoved.forEach((n) => line(`${n} is required but recorded in .agents/removed-skills.json; it is kept or added anyway, so drop it from the record`));
console.log(`\nOK (identical, or kept project knowledge): ${report.ok.length}`);
console.log(`PROJECT-ONLY firmware-layer files (keep): ${report.localOnly.length}`);
bySkill(report.localOnly).forEach(line);
console.log(`SYMLINKS (not followed, check by hand): ${links.length}`);
links.forEach((s) => line(`${s.in}: ${s.path}`));
process.exitCode = code;
