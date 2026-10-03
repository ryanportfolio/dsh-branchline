import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ACTIONS, NOTICE, detect, render } from "./write-ci-workflow.mjs";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "write-ci-workflow.mjs");

function project(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-workflow-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

const yamlFor = (root) => render(detect(root));
const cli = (root, ...args) => spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" });
const ciPath = (root) => path.join(root, ".github", "workflows", "ci.yml");

// A Python with PyYAML, when this machine has one. CI runners and most dev boxes do.
const python = ["python3", "python", "py"].find((exe) => spawnSync(exe, ["-c", "import yaml"], { encoding: "utf8" }).status === 0);
function parseYaml(text) {
  const r = spawnSync(python, ["-c", "import json, sys, yaml; print(json.dumps(yaml.safe_load(sys.stdin.read())))"], { input: text, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("npm: lockfile picks npm ci and only existing scripts become steps", (t) => {
  const root = project(t, {
    "package.json": { scripts: { test: "vitest run", build: "vite build", lint: "eslint ." } },
    "package-lock.json": "{}",
    ".nvmrc": "22\n",
  });
  const y = yamlFor(root);
  assert.match(y, /node-version-file: \.nvmrc/);
  assert.match(y, /cache: npm/);
  assert.match(y, /run: npm ci\n/);
  assert.match(y, /- name: Test\n {8}run: npm run test\n/);
  assert.match(y, /- name: Build\n {8}run: npm run build\n/);
  assert.doesNotMatch(y, /lint|Typecheck/);
});

test("node: package manager follows the lockfile", (t) => {
  const pkg = { scripts: { build: "tsc" } };
  const cases = [
    [{ "pnpm-lock.yaml": "" }, ["pnpm/action-setup@", "version: latest", "cache: pnpm", "run: pnpm install --frozen-lockfile", "run: pnpm run build"]],
    [{ "pnpm-lock.yaml": "", "package.json": { ...pkg, packageManager: "pnpm@10.4.0" } }, ["pnpm/action-setup@", "run: pnpm run build"]],
    [{ "yarn.lock": "" }, ["cache: yarn", "run: yarn install --frozen-lockfile", "run: yarn run build"]],
    [{ "yarn.lock": "", ".yarnrc.yml": "" }, ["corepack enable", "run: yarn install --immutable"]],
    [{ "bun.lock": "" }, [ACTIONS.setupBun, "run: bun install --frozen-lockfile", "run: bun run build"]],
    [{ "bun.lockb": "" }, [ACTIONS.setupBun]],
    [{}, ["node-version: 'lts/*'", "run: npm install\n"]],
  ];
  for (const [extra, expected] of cases) {
    const y = yamlFor(project(t, { "package.json": pkg, ...extra }));
    for (const e of expected) assert.ok(y.includes(e), `${JSON.stringify(extra)} missing ${e}\n${y}`);
  }
  const managed = yamlFor(project(t, { "package.json": { ...pkg, packageManager: "pnpm@10.4.0" }, "pnpm-lock.yaml": "" }));
  assert.doesNotMatch(managed, /version: latest/);
  assert.doesNotMatch(yamlFor(project(t, { "package.json": pkg, "bun.lock": "" })), /setup-node/);
  assert.doesNotMatch(yamlFor(project(t, { "package.json": pkg, "yarn.lock": "", ".yarnrc.yml": "" })), /cache: yarn/);
  assert.match(yamlFor(project(t, { "package.json": { ...pkg, engines: { node: ">=20" } } })), /node-version-file: package\.json/);
});

test("npm default test placeholder is not a test step", (t) => {
  const root = project(t, {
    "package.json": { scripts: { test: 'echo "Error: no test specified" && exit 1' } },
    "package-lock.json": "{}",
  });
  const y = yamlFor(root);
  assert.doesNotMatch(y, /npm run test/);
  assert.ok(y.includes(NOTICE), "no runnable command falls back to the notice");
});

test("TypeScript without a typecheck script runs tsc --noEmit", (t) => {
  const files = { "package.json": { devDependencies: { typescript: "^5" }, scripts: { build: "vite build" } }, "tsconfig.json": "{}" };
  assert.match(yamlFor(project(t, { ...files, "package-lock.json": "{}" })), /- name: Typecheck\n {8}run: npx tsc --noEmit\n/);
  assert.match(yamlFor(project(t, { ...files, "pnpm-lock.yaml": "" })), /run: pnpm exec tsc --noEmit/);
  // A typecheck script wins over the fallback.
  const scripted = yamlFor(project(t, { ...files, "package.json": { ...files["package.json"], scripts: { "type-check": "tsc -b" } } }));
  assert.match(scripted, /run: npm run type-check/);
  assert.doesNotMatch(scripted, /npx tsc/);
  // tsconfig.json without typescript as a dependency: no typecheck.
  assert.doesNotMatch(yamlFor(project(t, { "package.json": { scripts: { build: "x" } }, "tsconfig.json": "{}" })), /Typecheck/);
});

test("TypeScript project references typecheck in build mode", (t) => {
  // Root tsconfig in the Vite style: no files of its own, with comments and trailing commas.
  const refs = `{
  // Checks nothing itself; the referenced projects hold the sources.
  "files": [],
  /* "references": [] */
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }, // tools
  ],
}
`;
  const leaves = { "tsconfig.app.json": '{ "compilerOptions": { "noEmit": true }, "include": ["src"] }', "tsconfig.node.json": '{ "include": ["vite.config.ts"] }' };
  const ts = (typescript, extra = {}) =>
    yamlFor(project(t, { "package.json": { devDependencies: { typescript }, scripts: { build: "vite build" } }, "tsconfig.json": refs, "package-lock.json": "{}", ...leaves, ...extra }));
  // tsc accepts --noEmit with --build from 5.6.
  assert.match(ts("^5.9.3"), /- name: Typecheck\n {8}run: npx tsc -b --noEmit\n/);
  assert.match(ts("~7.0.2"), /run: npx tsc -b --noEmit\n/);
  // Older or unpinned minor versions reject the pair (TS5094), so plain build mode.
  for (const v of ["^5", "~5.5.4", "4.9.5", "latest"]) assert.match(ts(v), /run: npx tsc -b\n/, v);
  assert.match(ts("^5.6.0", { "pnpm-lock.yaml": "" }), /run: pnpm exec tsc -b --noEmit\n/);

  // --noEmit reaches every project, and a project with inputs may not reference one that does not
  // emit (TS6310, checked with TypeScript 5.9.3). A referenced project that references another,
  // a root with inputs of its own, or a reference that cannot be read gets plain build mode.
  const chain = { "tsconfig.app.json": '{ "compilerOptions": { "composite": true }, "references": [{ "path": "./lib" }] }', "lib/tsconfig.json": '{ "compilerOptions": { "composite": true } }' };
  assert.match(ts("^5.9.3", chain), /run: npx tsc -b\n/);
  const rootInputs = '{ "include": ["src"], "references": [{ "path": "./lib" }] }';
  assert.match(ts("^5.9.3", { "tsconfig.json": rootInputs, "lib/tsconfig.json": "{}" }), /run: npx tsc -b\n/);
  assert.match(ts("^5.9.3", { "tsconfig.json": '{ "references": [{ "path": "./lib" }] }', "lib/tsconfig.json": "{}" }), /run: npx tsc -b\n/, "no files key: default include");
  const leafOnly = '{ "files": [], "references": [{ "path": "./lib" }] }';
  assert.match(ts("^5.9.3", { "tsconfig.json": leafOnly, "lib/tsconfig.json": "{}" }), /run: npx tsc -b --noEmit\n/, "directory reference");
  assert.match(ts("^5.9.3", { "tsconfig.json": leafOnly }), /run: npx tsc -b\n/, "missing reference");
  // An empty include is no inputs too, so a leaf relying on --noEmit (TS5096 without it) keeps it.
  for (const root of ['{ "files": [], "include": [], "references": [{ "path": "./lib" }] }', '{ "include": [], "references": [{ "path": "./lib" }] }']) {
    assert.match(ts("^5.9.3", { "tsconfig.json": root, "lib/tsconfig.json": "{}" }), /run: npx tsc -b --noEmit\n/, root);
  }
  // Inputs inherited through extends count; an unreadable base gets plain build mode.
  const extending = (base) => ({ "tsconfig.json": '{ "extends": "./tsconfig.base.json", "files": [], "references": [{ "path": "./lib" }] }', "lib/tsconfig.json": "{}", "tsconfig.base.json": base });
  assert.match(ts("^5.9.3", extending('{ "include": ["src/**/*.ts"] }')), /run: npx tsc -b\n/);
  assert.match(ts("^5.9.3", extending('{ "compilerOptions": { "strict": true } }')), /run: npx tsc -b --noEmit\n/);
  const { "tsconfig.base.json": _, ...missingBase } = extending("");
  assert.match(ts("^5.9.3", missingBase), /run: npx tsc -b\n/, "missing base");
  // A package base is resolved by the project's own tsc --showConfig. Without TypeScript in
  // node_modules it reads as unknown; a root that sets both keys itself needs no base at all.
  const pkgRoot = { "tsconfig.json": '{ "extends": "@acme/tsconfig", "files": [], "references": [{ "path": "./lib" }] }', "lib/tsconfig.json": "{}" };
  const pkgBase = { "node_modules/@acme/tsconfig/tsconfig.json": "{}" };
  assert.match(ts("^5.9.3", { ...pkgRoot, ...pkgBase }), /run: npx tsc -b\n/, "package base without TypeScript installed");
  const ownKeys = '{ "extends": "@acme/tsconfig", "files": [], "include": [], "references": [{ "path": "./lib" }] }';
  assert.match(ts("^5.9.3", { ...pkgRoot, "tsconfig.json": ownKeys }), /run: npx tsc -b --noEmit\n/, "own files and include");
  // A stand-in tsc that checks its arguments and prints a --showConfig result, or fails.
  const tsc = (shown) => ({
    "node_modules/typescript/bin/tsc": [
      "const [p, config, flag] = process.argv.slice(2);",
      'if (p !== "-p" || !config.endsWith("tsconfig.json") || flag !== "--showConfig") process.exit(3);',
      shown === null ? "process.exit(1);" : `process.stdout.write(${JSON.stringify(JSON.stringify(shown))});`,
    ].join("\n"),
  });
  const libRefs = [{ path: "./lib" }];
  assert.match(ts("^5.9.3", { ...pkgRoot, ...pkgBase, ...tsc({ compilerOptions: {}, references: libRefs }) }), /run: npx tsc -b --noEmit\n/, "tsc shows no inputs");
  assert.match(ts("^5.9.3", { ...pkgRoot, ...pkgBase, ...tsc({ files: ["./src/a.ts"], include: ["src"], references: libRefs }) }), /run: npx tsc -b\n/, "tsc shows inputs");
  assert.match(ts("^5.9.3", { ...pkgRoot, ...pkgBase, ...tsc({ include: ["nothing/**/*.ts"], references: libRefs }) }), /run: npx tsc -b\n/, "an include pattern counts");
  assert.match(ts("^5.9.3", { ...pkgRoot, ...pkgBase, ...tsc(null) }), /run: npx tsc -b\n/, "tsc fails");
  // --showConfig omits the default include too, so neither key proves nothing without the root's own files.
  const noFilesKey = '{ "extends": "@acme/tsconfig", "references": [{ "path": "./lib" }] }';
  assert.match(ts("^5.9.3", { ...pkgRoot, "tsconfig.json": noFilesKey, ...pkgBase, ...tsc({ compilerOptions: {}, references: libRefs }) }), /run: npx tsc -b\n/, "default include");
  // A typecheck script wins before tsc is ever run.
  const scripted = { ...pkgRoot, ...pkgBase, "node_modules/typescript/bin/tsc": 'require("fs").writeFileSync("tsc-ran", ""); process.stdout.write("{}");' };
  const scriptedRoot = project(t, { "package.json": { devDependencies: { typescript: "^5.9.3" }, scripts: { typecheck: "tsc -b" } }, ...scripted });
  assert.match(yamlFor(scriptedRoot), /run: npm run typecheck\n/);
  assert.equal(fs.existsSync(path.join(scriptedRoot, "tsc-ran")), false, "tsc not run for a typecheck script");
  // A byte order mark at the start of a tsconfig is not a parse failure.
  const bom = String.fromCharCode(0xfeff);
  assert.match(ts("^5.9.3", { "tsconfig.json": bom + leafOnly, "lib/tsconfig.json": `${bom}{}` }), /run: npx tsc -b --noEmit\n/, "byte order mark");

  // An empty list, or references only inside a comment or string, keeps tsc --noEmit.
  const noRefs = (tsconfig) =>
    yamlFor(project(t, { "package.json": { devDependencies: { typescript: "^5.9" } }, "tsconfig.json": tsconfig, "package-lock.json": "{}" }));
  assert.match(noRefs('{ "references": [], }'), /run: npx tsc --noEmit\n/);
  assert.match(noRefs('{\n  // "references": [{ "path": "a" }]\n  "include": ["src"],\n}'), /run: npx tsc --noEmit\n/);
  assert.match(noRefs('{ "compilerOptions": { "outDir": "// \\"references\\": [{" } }'), /run: npx tsc --noEmit\n/);
});

test("Python with uv uses setup-uv and uv run", (t) => {
  const root = project(t, {
    "pyproject.toml": '[project]\nname = "x"\nrequires-python = ">=3.11"\ndependencies = []\n\n[dependency-groups]\ndev = ["pytest>=8"]\n\n[tool.mypy]\nstrict = true\n',
    "uv.lock": "",
    "tests/test_a.py": "def test_a():\n    assert True\n",
  });
  const y = yamlFor(root);
  assert.ok(y.includes(`uses: ${ACTIONS.setupUv}`));
  assert.doesNotMatch(y, /setup-python/);
  assert.match(y, /run: uv sync --locked\n/);
  assert.match(y, /- name: Typecheck\n {8}run: uv run --with mypy mypy \.\n/);
  assert.match(y, /- name: Test\n {8}run: uv run pytest\n/);
});

test("Python with pip installs requirements, the package and pytest", (t) => {
  const root = project(t, {
    "requirements.txt": "requests\n",
    "requirements-dev.txt": "black\n",
    "requirements-docs.txt": "sphinx\n",
    "pyproject.toml": '[project]\nname = "x"\n\n[project.optional-dependencies]\ntest = ["coverage"]\n\n[tool.pytest.ini_options]\naddopts = "-q"\n',
    ".python-version": "3.10\n",
    "pkg/test_mod.py": "def test_x():\n    pass\n",
  });
  const y = yamlFor(root);
  assert.match(y, /python-version-file: \.python-version/);
  assert.match(y, /run: \|\n {10}python -m pip install --upgrade pip\n {10}pip install -r requirements\.txt\n/);
  assert.match(y, / {10}pip install -r requirements-dev\.txt\n/);
  assert.doesNotMatch(y, /requirements-docs/);
  assert.ok(y.includes(`          pip install -e ".[test]"\n`));
  assert.match(y, / {10}pip install pytest\n/, "pytest config alone does not declare pytest");
  assert.match(y, /- name: Test\n {8}run: python -m pytest\n/);
  assert.doesNotMatch(y, /Typecheck/);

  const typed = yamlFor(project(t, { "requirements.txt": "pytest\nmypy\n", "mypy.ini": "[mypy]\n", "test_a.py": "" }));
  assert.match(typed, /python-version: 3\.x/);
  assert.doesNotMatch(typed, /pip install pytest|pip install mypy/);
  assert.match(typed, /run: mypy \.\n/);

  // pip install -e . skips dependency groups, so pytest declared only there is still installed.
  const grouped = yamlFor(project(t, { "pyproject.toml": '[project]\nname = "x"\n\n[dependency-groups]\ndev = ["pytest"]\n', "tests/test_a.py": "" }));
  assert.match(grouped, / {10}pip install -e \.\n {10}pip install pytest\n/);

  // Dependencies but no tests and no typechecker: nothing to run, so the notice.
  assert.ok(yamlFor(project(t, { "requirements.txt": "flask\n" })).includes(NOTICE));
});

test("Python tools count as installed only from what the install step installs", (t) => {
  const py = (body) => `[project]\nname = "x"\nversion = "0.1.0"\ndependencies = []\n\n${body}`;
  const testFile = { "tests/test_a.py": "def test_a():\n    pass\n" };

  // uv sync installs neither extras nor non-default groups.
  const uvExtra = yamlFor(project(t, { "pyproject.toml": py('[project.optional-dependencies]\ntest = ["pytest"]\n'), "uv.lock": "", ...testFile }));
  assert.match(uvExtra, /- name: Test\n {8}run: uv run --with pytest pytest\n/);
  const uvGroup = yamlFor(project(t, { "pyproject.toml": py('[dependency-groups]\ntest = ["pytest"]\n'), "uv.lock": "", ...testFile }));
  assert.match(uvGroup, /- name: Test\n {8}run: uv run --with pytest pytest\n/);
  // [project].dependencies and groups named in [tool.uv] default-groups are installed.
  const uvDeps = yamlFor(project(t, { "pyproject.toml": '[project]\nname = "x"\ndependencies = [\n  "pytest>=8",  # tests\n]\n', "uv.lock": "", ...testFile }));
  assert.match(uvDeps, /run: uv run pytest\n/);
  const uvDefault = yamlFor(project(t, { "pyproject.toml": py('[dependency-groups]\ntest = ["pytest"]\n\n[tool.uv]\ndefault-groups = ["test"]\n'), "uv.lock": "", ...testFile }));
  assert.match(uvDefault, /run: uv run pytest\n/);

  // pip install -e . installs no extras; the unselected qa and ci extras do not count.
  const pipQa = yamlFor(project(t, { "pyproject.toml": py('[project.optional-dependencies]\nqa = ["mypy"]\n\n[tool.mypy]\nstrict = true\n') }));
  assert.match(pipQa, / {10}pip install -e \.\n {10}pip install mypy\n {6}- name: Typecheck\n {8}run: mypy \.\n/);
  const pipCi = yamlFor(project(t, { "pyproject.toml": py('[project.optional-dependencies]\nci = ["pytest"]\n'), ...testFile }));
  assert.match(pipCi, / {10}pip install -e \.\n {10}pip install pytest\n {6}- name: Test\n {8}run: python -m pytest\n/);
  // A selected extra does count.
  const pipTestExtra = yamlFor(project(t, { "pyproject.toml": py('[project.optional-dependencies]\ntest = ["pytest"]\nqa = ["mypy"]\n'), ...testFile }));
  assert.ok(pipTestExtra.includes(`          pip install -e ".[test]"\n`));
  assert.doesNotMatch(pipTestExtra, /pip install pytest/);

  // setup.cfg: install_requires and selected extras count, other extras do not.
  const cfg = (extras) => ({
    "setup.py": "from setuptools import setup\nsetup()\n",
    "setup.cfg": `[metadata]\nname = x\n\n[options]\ninstall_requires =\n    requests\n\n[options.extras_require]\n${extras}`,
    "mypy.ini": "[mypy]\n",
    ...testFile,
  });
  const cfgSelected = yamlFor(project(t, cfg("test =\n    pytest\n    mypy\n")));
  assert.ok(cfgSelected.includes(`          pip install -e ".[test]"\n`));
  assert.doesNotMatch(cfgSelected, /pip install (pytest|mypy)/);
  const cfgOther = yamlFor(project(t, cfg("lint =\n    pytest\n    mypy\n")));
  assert.match(cfgOther, / {10}pip install -e \.\n {10}pip install pytest mypy\n/);

  // pip with pytest in requirements-dev.txt installs it from there.
  const reqDev = yamlFor(project(t, { "requirements.txt": "requests\n", "requirements-dev.txt": "pytest\n", ...testFile }));
  assert.match(reqDev, / {10}pip install -r requirements-dev\.txt\n {6}- name: Test\n {8}run: python -m pytest\n/);
  // A commented-out requirement is not installed.
  assert.match(yamlFor(project(t, { "requirements.txt": "requests  # pytest later\n", ...testFile })), / {10}pip install pytest\n/);

  // A declaration with an environment marker may be skipped on the ubuntu runner, so it does not count.
  const marked = 'pytest; sys_platform == "win32"';
  assert.match(yamlFor(project(t, { "requirements.txt": `requests\n${marked}\n`, ...testFile })), / {10}pip install pytest\n/);
  const pipMarked = yamlFor(project(t, { "pyproject.toml": `[project]\nname = "x"\ndependencies = [\n  "requests",\n  '${marked}',\n]\n`, ...testFile }));
  assert.match(pipMarked, / {10}pip install -e \.\n {10}pip install pytest\n/);
  const cfgMarked = yamlFor(project(t, { ...cfg(`test =\n    ${marked}\n    mypy\n`) }));
  assert.match(cfgMarked, / {10}pip install -e "\.\[test\]"\n {10}pip install pytest\n/);
  const uvMarked = yamlFor(project(t, { "pyproject.toml": py(`[dependency-groups]\ndev = ["pytest; sys_platform == 'win32'", "mypy"]\n`), "uv.lock": "", ...testFile }));
  assert.match(uvMarked, /run: uv run --with pytest pytest\n/);
  // A marker on a continued line, or written as a TOML escape, is still a marker.
  assert.match(yamlFor(project(t, { "requirements.txt": 'pytest \\\n  ; sys_platform == "win32"\n', ...testFile })), / {10}pip install pytest\n/);
  assert.doesNotMatch(yamlFor(project(t, { "requirements.txt": "pytest \\\n  >=8\n", ...testFile })), /pip install pytest/, "continued line without a marker");
  const escaped = `[project]\nname = "x"\ndependencies = ["pytest\\u003b sys_platform == 'win32'"]\n`;
  assert.match(yamlFor(project(t, { "pyproject.toml": escaped, ...testFile })), / {10}pip install pytest\n/);
  assert.match(yamlFor(project(t, { "pyproject.toml": escaped, "uv.lock": "", ...testFile })), /run: uv run --with pytest pytest\n/);
  // The same declaration without the marker still counts.
  assert.doesNotMatch(yamlFor(project(t, { "requirements.txt": "requests\npytest\n", ...testFile })), /pip install pytest/);
});

test("requirements filenames are quoted for the shell", (t) => {
  const testFile = { "tests/test_a.py": "def test_a():\n    pass\n" };
  const y = yamlFor(project(t, { "requirements dev.txt": "pytest\n", "requirements-o'k.txt": "requests\n", ...testFile }));
  assert.match(y, / {10}pip install -r 'requirements dev\.txt'\n/);
  assert.ok(y.includes(`          pip install -r 'requirements-o'\\''k.txt'\n`), y);
  assert.match(y, /- name: Test\n {8}run: python -m pytest\n/, "pytest from the quoted file counts as installed");
  assert.match(yamlFor(project(t, { "requirements.txt": "requests\n", ...testFile })), /pip install -r requirements\.txt\n/, "plain names stay plain");
});

test("quoted requirements filenames reach pip as one argument", { skip: spawnSync("sh", ["-c", "true"]).status === 0 ? false : "no POSIX sh on this machine" }, (t) => {
  for (const name of ["requirements dev.txt", "requirements-o'k $HOME.txt"]) {
    const line = yamlFor(project(t, { [name]: "", "test_a.py": "" })).split("\n").find((l) => l.includes("pip install -r"));
    const r = spawnSync("sh", ["-c", `set -- ${line.trim().slice("pip install -r ".length)}; printf '%s\\n' "$#" "$1"`], { encoding: "utf8" });
    assert.equal(r.stdout, `1\n${name}\n`, line);
  }
});

test("TOML section headers with a trailing comment or inner spaces read like plain ones", (t) => {
  const testFile = { "tests/test_a.py": "def test_a():\n    pass\n" };
  const extras = (header) =>
    `[project]\nname = "x"\nversion = "0"\ndependencies = []\n\n${header}\ntest = ["pytest", "pytest-asyncio"]\n\n[build-system]\nrequires = ["setuptools"]\n`;
  const plain = yamlFor(project(t, { "pyproject.toml": extras("[project.optional-dependencies]"), ...testFile }));
  assert.ok(plain.includes(`          pip install -e ".[test]"\n`));
  for (const header of ["[project.optional-dependencies] # testing tools", "[ project.optional-dependencies ]", "  [project.optional-dependencies]#x"]) {
    assert.equal(yamlFor(project(t, { "pyproject.toml": extras(header), ...testFile })), plain, header);
  }
  // [project] with a comment still supplies the dependencies, so pytest is not installed again.
  const meta = (header) => yamlFor(project(t, { "pyproject.toml": `${header}\nname = "x"\ndependencies = ["pytest"]\n`, ...testFile }));
  for (const header of ["[project] # meta", "[ project ]"]) {
    const y = meta(header);
    assert.match(y, / {10}pip install -e \.\n {6}- name: Test\n/, header);
    assert.doesNotMatch(y, /pip install pytest/, header);
  }
  // A longer name that starts the same is a different section.
  assert.match(meta("[project-extra]"), /pip install pytest\n/);
});

test("a tests folder without Python test files adds no Python test step", (t) => {
  const root = project(t, {
    "package.json": { name: "x", scripts: { test: "node --test tests" } },
    "package-lock.json": "{}",
    "pyproject.toml": "[tool.black]\nline-length = 100\n",
    "tests/a.test.js": "",
  });
  const y = yamlFor(root);
  assert.match(y, /^ {2}node:$/m);
  assert.doesNotMatch(y, /^ {2}python:$/m);
  assert.doesNotMatch(y, /pytest/);
});

test("Rust builds locked when Cargo.lock exists and tests", (t) => {
  const locked = yamlFor(project(t, { "Cargo.toml": "[package]\nname = \"x\"\n", "Cargo.lock": "" }));
  assert.match(locked, /run: cargo build --locked\n/);
  assert.match(locked, /run: cargo test\n/);
  assert.match(yamlFor(project(t, { "Cargo.toml": "" })), /run: cargo build\n/);
});

test("Go vets, builds and tests with the go.mod version", (t) => {
  const y = yamlFor(project(t, { "go.mod": "module example.com/x\n\ngo 1.23\n" }));
  assert.ok(y.includes(`uses: ${ACTIONS.setupGo}`));
  assert.match(y, /go-version-file: go\.mod/);
  for (const c of ["go vet ./...", "go build ./...", "go test ./..."]) assert.ok(y.includes(`run: ${c}\n`), c);
});

test("nothing detected: a notice and the firmware job, no fake test", (t) => {
  const root = project(t, { "README.md": "# x\n", ".claude/scripts/sync-codex-skills.mjs": "" });
  const y = yamlFor(root);
  assert.ok(y.includes(`::notice title=No CI commands detected::${NOTICE}`));
  assert.match(y, /run: node \.claude\/scripts\/sync-codex-skills\.mjs --check\n/);
  assert.doesNotMatch(y, /npm|pytest|cargo|go test/);
  assert.doesNotMatch(yamlFor(project(t, { "README.md": "" })), /firmware:/, "no firmware job without the script");
});

test("one job per detected stack, plus shared workflow settings", (t) => {
  const root = project(t, {
    "package.json": { scripts: { build: "x" } },
    "go.mod": "module x\n\ngo 1.22\n",
    "Cargo.toml": "",
    ".claude/scripts/sync-codex-skills.mjs": "",
  });
  const y = yamlFor(root);
  for (const j of ["node", "go", "rust", "firmware"]) assert.match(y, new RegExp(`^  ${j}:$`, "m"));
  assert.match(y, /^# Generated by \/init-project \(\.claude\/scripts\/write-ci-workflow\.mjs\)\. Safe to edit/);
  assert.match(y, /^ {4}branches: \[main\]$/m);
  assert.match(y, /^ {2}pull_request:$/m);
  assert.match(y, /^ {2}cancel-in-progress: true$/m);
  assert.match(y, /^permissions:\n {2}contents: read$/m);
  assert.doesNotMatch(y, /\r/);
});

test("a branch name with YAML flow characters stays one quoted branch", () => {
  const branches = (branch) => render({ stacks: [], firmware: false, branch }).split("\n").find((l) => l.includes("branches:"));
  assert.equal(branches("release,stable"), "    branches: ['release,stable']");
  assert.equal(branches("it's"), "    branches: ['it''s']");
  assert.equal(branches("feature/x-1.2"), "    branches: [feature/x-1.2]");
});

test("branch names with flow characters parse as one branch", { skip: python ? false : "no Python with PyYAML on this machine" }, () => {
  for (const branch of ["release,stable", "a]b", "it's", "x{y}"]) {
    const doc = parseYaml(render({ stacks: [], firmware: false, branch }));
    assert.deepEqual((doc.on ?? doc.true).push.branches, [branch]);
  }
});

test("generated YAML parses", { skip: python ? false : "no Python with PyYAML on this machine" }, (t) => {
  const fixtures = [
    { "package.json": { devDependencies: { typescript: "5" }, scripts: { test: "x" } }, "tsconfig.json": "{}", "yarn.lock": "", ".yarnrc.yml": "" },
    { "pyproject.toml": '[project]\nname = "x"\n[project.optional-dependencies]\ndev = ["pytest"]\n', "tests/test_a.py": "" },
    { "requirements dev's.txt": "", "test_a.py": "" },
    { "go.mod": "go 1.22\n", "Cargo.toml": "", ".claude/scripts/sync-codex-skills.mjs": "" },
    { ".claude/scripts/sync-codex-skills.mjs": "" },
  ];
  for (const files of fixtures) {
    const doc = parseYaml(yamlFor(project(t, files)));
    assert.equal(doc.name, "CI");
    assert.deepEqual(doc.permissions, { contents: "read" });
    // PyYAML follows YAML 1.1, where a bare `on` key loads as true. GitHub reads it as "on".
    assert.deepEqual((doc.on ?? doc.true).push.branches, ["main"]);
    for (const [id, job] of Object.entries(doc.jobs)) {
      assert.equal(job["runs-on"], "ubuntu-latest", id);
      assert.ok(job.steps.length > 0, id);
      for (const s of job.steps) assert.ok(typeof (s.run ?? s.uses) === "string", `${id}: ${JSON.stringify(s)}`);
    }
  }
});

test("print mode writes nothing", (t) => {
  const root = project(t, { "go.mod": "go 1.22\n" });
  const r = cli(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /Detected:\n- go \(Go 1\.22 from go\.mod\)/);
  assert.equal(r.stdout, yamlFor(root), "stdout is the workflow alone, so it can be redirected and diffed");
  assert.equal(fs.existsSync(path.join(root, ".github")), false);
});

test("--write creates ci.yml and refuses to overwrite without --force", (t) => {
  const root = project(t, { "go.mod": "go 1.22\n" });
  let r = cli(root, "--write");
  assert.equal(r.status, 0, r.stderr);
  const written = fs.readFileSync(ciPath(root), "utf8");
  assert.equal(written, yamlFor(root));

  fs.writeFileSync(ciPath(root), "# hand edited\n");
  r = cli(root, "--write");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /already exists; not overwriting.*--force/s);
  assert.equal(fs.readFileSync(ciPath(root), "utf8"), "# hand edited\n");

  r = cli(root, "--write", "--force");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(ciPath(root), "utf8"), written);

  r = cli(root, "--force");
  assert.notEqual(r.status, 0, "--force without --write is an error");
});
