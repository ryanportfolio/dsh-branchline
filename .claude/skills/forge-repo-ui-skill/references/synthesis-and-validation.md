# Synthesis and validation

Turn the research matrix into one lean repository-local skill.

## Architecture

Prefer:

```text
<canonical-skill-root>/<verb-repo-ui>/
├── SKILL.md
├── NOTICE.md                 # when external work informed synthesis
└── references/
    ├── build.md              # only if implementation guidance is needed
    └── audit.md              # only if review guidance is needed
```

Create only files that earn their context and maintenance cost. Do not add a README, changelog, install guide, copied catalogs, or decorative assets.

## Canonical location

Determine location from repository instructions and tooling:

- use the declared canonical library when adapters are generated elsewhere;
- never hand-edit generated adapters;
- run required sync/generation commands after canonical edits;
- if no convention exists, prefer the runtime's repository-local skill directory and document the choice.

Global installation of the generated repo-specific skill is usually wrong: it would leak project assumptions into other repositories.

## SKILL.md design

Frontmatter:

- verb-led lowercase name under 64 characters;
- description states what it does, concrete UI triggers, repository scope, and exclusions;
- keep frontmatter fields compatible with the target runtime.

Body:

1. State outcome and authority order.
2. Require reading existing product/design/instruction sources.
3. Classify surface and change mode only when those distinctions affect behavior.
4. Protect product/security/accessibility contracts.
5. Route build versus audit references.
6. State the small set of always-on implementation rules.
7. Define honest verification and completion reporting.

Do not duplicate palette tables, typography scales, component inventories, route lists, or test commands already maintained elsewhere. Link/read the source of truth.

## Content selection

Include:

- non-obvious repository-specific decisions;
- workflows that prevent repeated failures;
- explicit stack/tool exclusions that counter common wrong assumptions;
- smallest-causal-change guidance for mature interfaces;
- realistic states, responsive, keyboard, copy, and evidence checks tailored to product risk;
- runtime and visual-verification honesty.

Exclude:

- motivational design prose;
- generic WCAG tutorials;
- exhaustive style/taste lists;
- hardcoded framework advice absent from the repo;
- aesthetic bans contradicted by the local brand;
- mandatory mockups, variants, interviews, or approval loops for routine edits;
- subagent/browser/image requirements when capabilities are optional;
- commands already enforced by higher-level instructions.

## Replacement gate

Before deleting/disabling an existing skill, show:

```text
Replace:
Preserved capabilities:
Intentionally removed:
Canonical paths affected:
Generated adapters affected:
Rollback:
```

Require explicit replacement approval unless prior approved plan named these exact effects. Preserve unrelated user changes and stage explicit paths only.

## Provenance

- Prefer original wording synthesized from concepts.
- Link every materially reviewed source in `NOTICE.md` or the repository's provenance index.
- If copying substantial text/code, retain the required license and notices.
- Record that candidate scripts/datasets were not vendored when true.

## Structural validation

Run the target runtime's validator when available. Otherwise verify equivalently:

- `SKILL.md` exists;
- YAML frontmatter parses;
- name/description exist and meet naming/length rules;
- only allowed frontmatter keys are used;
- every referenced file exists;
- no TODOs/placeholders remain;
- no reference nesting deeper than one level;
- main body stays below 500 lines and preferably below 5,000 words;
- total size stays within the planned context budget;
- generated adapters are current.

## Scenario validation

Evaluate at least these repository-adjusted prompts:

1. **Small extension**: should inspect and proceed without redesign ceremony.
2. **UI audit**: should diagnose without editing unless fixes requested.
3. **Major overhaul**: should preserve contracts and request approval for material direction changes.
4. **Accessibility/responsive defect**: should prioritize task completion and repo targets over taste.
5. **Backend-only request**: should not trigger.
6. **Absent-tool temptation**: should not introduce shadcn, Motion, Figma, image generation, or another absent dependency.
7. **Conflicting external advice**: local product/design truth must win.

Use a fresh independent agent only when the environment exposes one and the user permits it. Pass the skill and realistic task, not expected conclusions. Otherwise label validation as direct/static, never independent.

## Repository checks

Run:

- required skill/adaptor sync check;
- diff/format validation;
- relevant targeted checks;
- repository-mandated type/test gates when environment and authorization permit.

Skill-only changes rarely need browser acceptance. If the generated skill also changes UI code, follow the repository's browser/runtime rules.

## Completion report

Report concise evidence:

```text
Local skill:
Replaced/disabled:
Sources reviewed:
Instructional size before/after:
Structural validation:
Adapter validation:
Repository checks:
Scenario validation:
Unverified:
```

Do not commit, push, publish, install dependencies, or modify an external checkout unless explicitly authorized.
