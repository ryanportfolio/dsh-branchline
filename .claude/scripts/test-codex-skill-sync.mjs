import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scratch = path.resolve('.tmp/native-skills/sync-tests');
fs.mkdirSync(scratch, { recursive: true });
const generator = fs.readFileSync('.claude/scripts/sync-codex-skills.mjs', 'utf8');
const body = name => `---\nname: ${name}\ndescription: Explain a scoped task.\n---\n\nKeep facts intact.\n`;
function fixture() {
  const root = fs.mkdtempSync(path.join(scratch, 'case-'));
  const write = (p, s) => { const target = path.join(root, p); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, s); };
  write('.claude/scripts/sync-codex-skills.mjs', generator);
  write('.claude/skills/bro/SKILL.md', body('bro'));
  const run = (mode = '--check') => spawnSync(process.execPath, [path.join(root, '.claude/scripts/sync-codex-skills.mjs'), mode], { encoding: 'utf8' });
  const modes = skills => write('.agents/skill-modes.json', JSON.stringify({ version: 1, skills }));
  return { root, write, run, modes, read: p => fs.readFileSync(path.join(root, p), 'utf8') };
}

test('legacy adapter generation remains idempotent and updates changed metadata', () => {
  const f = fixture();
  assert.equal(f.run().status, 1);
  assert.equal(f.run('--write').status, 0);
  assert.equal(f.run().status, 0);
  f.write('.claude/skills/bro/SKILL.md', body('bro').replace('Explain', 'Review'));
  assert.equal(f.run().status, 1);
  assert.equal(f.run('--write').status, 0);
  assert.match(f.read('.agents/skills/bro/SKILL.md'), /Review a scoped task/);
});

test('native files survive sync byte-for-byte even when Claude changes', () => {
  const f = fixture(); f.modes({ bro: 'native', extra: 'native' });
  for (const name of ['bro', 'extra']) f.write(`.agents/skills/${name}/SKILL.md`, body(name));
  f.write('.claude/skills/bro/SKILL.md', body('bro').replace('Explain', 'Changed'));
  assert.equal(f.run('--write').status, 0);
  assert.equal(f.read('.agents/skills/bro/SKILL.md'), body('bro'));
  assert.equal(f.read('.agents/skills/extra/SKILL.md'), body('extra'));
});

test('disabled generated adapters disappear without deleting supporting files', () => {
  const f = fixture(); assert.equal(f.run('--write').status, 0);
  f.write('.agents/skills/bro/notes.txt', 'retain'); f.modes({ bro: 'disabled' });
  assert.equal(f.run('--write').status, 0);
  assert.equal(fs.existsSync(path.join(f.root, '.agents/skills/bro/SKILL.md')), false);
  assert.equal(f.read('.agents/skills/bro/notes.txt'), 'retain');
  assert.equal(f.run().status, 0);
});

test('Claude disabled choices are preserved and never silently reenabled', () => {
  const f = fixture(); f.modes({ bro: 'adapter' });
  f.write('.claude/settings.json', JSON.stringify({ skillOverrides: { bro: 'off' } }));
  assert.equal(f.run('--write').status, 0);
  assert.equal(fs.existsSync(path.join(f.root, '.agents/skills/bro/SKILL.md')), false);
});

test('unowned and disabled native files are never overwritten or deleted', () => {
  const f = fixture(); f.write('.agents/skills/bro/SKILL.md', body('bro'));
  assert.match(f.run('--write').stderr, /refusing to overwrite/);
  f.modes({ bro: 'disabled' });
  assert.match(f.run('--write').stderr, /remains discoverable/);
  assert.equal(f.read('.agents/skills/bro/SKILL.md'), body('bro'));
});

test('native mode rejects missing files, generated wrappers and mismatched metadata', () => {
  const f = fixture(); f.modes({ bro: 'native' });
  assert.match(f.run().stderr, /native mode requires/);
  f.modes({}); assert.equal(f.run('--write').status, 0); f.modes({ bro: 'native' });
  assert.match(f.run().stderr, /native mode requires/);
  f.write('.agents/skills/bro/SKILL.md', body('wrong'));
  assert.match(f.run().stderr, /native metadata/);
  f.write('.agents/skills/bro/SKILL.md', body('bro').replace('name: bro\n', '') + '\nname: bro\n');
  assert.match(f.run().stderr, /native metadata/);
});

test('broken native references fail before generated mutations happen', () => {
  const f = fixture(); f.modes({ extra: 'native' });
  f.write('.agents/skills/extra/SKILL.md', body('extra') + '[Guide](references/missing.md)\n');
  assert.match(f.run('--write').stderr, /missing reference/);
  assert.equal(fs.existsSync(path.join(f.root, '.agents/skills/bro/SKILL.md')), false);
  f.write('.agents/skills/extra/references/missing.md', 'Guide');
  assert.equal(f.run('--write').status, 0);
  f.write('.agents/skills/extra/guide with spaces.md', 'Guide');
  f.write('.agents/skills/extra/guide(v2).md', 'Guide');
  f.write('.agents/skills/extra/SKILL.md', body('extra') + '[Guide](<guide with spaces.md>)\n[Version](guide(v2).md)\n[Ref][r]\n[r]: <references/missing.md>\n');
  assert.equal(f.run().status, 0);
  f.write('.agents/skills/extra/SKILL.md', body('extra') + '[Ref][r]\n[r]: <missing file.md>\n');
  assert.match(f.run().stderr, /missing reference/);
});

test('native references resolve through directory links; generated writes cannot escape', () => {
  const f = fixture(); const outside = fs.mkdtempSync(path.join(scratch, 'linked-'));
  fs.writeFileSync(path.join(outside, 'SKILL.md'), body('bro') + '[Guide](guide.md)\n');
  fs.writeFileSync(path.join(outside, 'guide.md'), 'Guide');
  fs.mkdirSync(path.join(f.root, '.agents/skills'), { recursive: true });
  fs.symlinkSync(outside, path.join(f.root, '.agents/skills/bro'), process.platform === 'win32' ? 'junction' : 'dir');
  f.modes({ bro: 'native' }); assert.equal(f.run().status, 0);
  f.modes({ bro: 'disabled' }); assert.match(f.run('--write').stderr, /remains discoverable/);
  f.modes({ bro: 'native' });
  f.write('.claude/settings.json', JSON.stringify({skillOverrides: {bro: 'off'}}));
  assert.match(f.run('--write').stderr, /remains discoverable/);
  f.write('.claude/settings.json', '{}');
  fs.writeFileSync(path.join(outside, 'SKILL.md'), '<!-- Generated by .claude/scripts/sync-codex-skills.mjs. Do not edit. -->');
  f.modes({ bro: 'adapter' });
  assert.match(f.run('--write').stderr, /outside this repository/);
  assert.equal(fs.readFileSync(path.join(outside, 'SKILL.md'), 'utf8'), '<!-- Generated by .claude/scripts/sync-codex-skills.mjs. Do not edit. -->');
});

test('invalid ownership names and modes fail closed', () => {
  const f = fixture(); f.modes({ '../escape': 'native' });
  assert.match(f.run().stderr, /invalid skill/);
  f.modes({ bro: 'automatic' }); assert.match(f.run().stderr, /invalid skill/);
});

test('block scalar chomping indicators retain the routing description', () => {
  for (const style of ['>', '>-', '>+', '|', '|-', '|+']) {
    const f = fixture();
    f.write('.claude/skills/bro/SKILL.md', '---\nname: bro\ndescription: '+style+'\n  Explain the requested task.\n  Keep its scope.\n---\n');
    const result = f.run('--write'); assert.equal(result.status, 0, result.stderr);
    const generated = f.read('.agents/skills/bro/SKILL.md');
    assert.match(generated, /Explain the requested task/);
    assert.match(generated, /Keep its scope/);
  }
});
