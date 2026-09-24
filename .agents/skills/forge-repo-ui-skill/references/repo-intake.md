# Repository intake

Inspect the repository before searching for design skills. Goal: define what “useful” means here.

## 1. Load authority

Read completely, when present:

- root and nested `AGENTS.md` / `CLAUDE.md` / equivalent instructions;
- product briefs, design-system files, architecture docs, reference libraries;
- skill compatibility, provenance, settings, and skill override files;
- package manifests and workspace configuration.

Honor reference-routing instructions. Treat `FILL IN`, TODO markers, and empty templates as unknown, not facts.

## 2. Map actual frontend

Use fast repository search (`rg --files`, `rg`) before broad reads. Identify:

- frontend packages and frameworks;
- routes/pages/screens and major user journeys;
- component libraries, primitives, icon sets, styling engine, tokens, themes, and motion libraries;
- forms, tables, charts, editors, media, 3D, canvas, mobile, or marketing surfaces that truly exist;
- UI tests, browser tooling, Storybook, visual regression, accessibility tools, and runnable commands;
- deployment/runtime constraints affecting verification or dependency installation.

Inspect representative code from each distinct surface. Do not read every component mechanically.

## 3. Map product and users

Record:

```text
Product:
Primary users and context:
Critical user tasks:
High-stakes contracts:
UI surfaces:
Brand/design maturity:
Design source of truth:
Frontend stack:
Existing primitives:
Current design/UI skills:
Canonical skill location and adapter process:
Verification available:
Unknowns:
```

High-stakes contracts include security boundaries, accessibility targets, evidence/citation rules, financial or medical accuracy, destructive actions, permissions, and data-loss risks.

## 4. Determine design maturity

Classify:

- **Settled**: tokens, typography, spacing, components, motion, and product principles documented and shipped. Generated skill applies and audits; it does not invent a new style.
- **Partial**: some rules/components exist but gaps remain. Generated skill preserves stable parts and defines how to resolve gaps from code/product context.
- **Greenfield**: little reliable direction. Generated skill may include a compact direction-selection workflow, still grounded in product and audience.

## 5. Inventory overlap

For each active UI/design skill, capture:

- trigger description;
- body/reference size;
- commands or modes;
- framework/tool assumptions;
- valuable unique capabilities;
- duplication and conflicts;
- generated versus canonical status;
- license/provenance.

Do not infer active status from presence alone; inspect settings and runtime discovery rules.

## 6. Define exclusions

Write an explicit ignore list before web research. Typical exclusions:

- React/Next/shadcn/Tailwind guidance when the repo uses another stack;
- marketing, branding, slides, video, canvas, Three.js, or image generation when absent;
- style, font, and palette discovery when the design system is settled;
- dark-mode guidance when no dark mode is shipped or requested;
- Figma/Stitch workflows without those integrations;
- mobile-native patterns for desktop web;
- generic accessibility essays when a stronger repo-specific contract exists;
- live-browser orchestration when browser control is separate or unavailable.

## 7. Produce the intake verdict

End intake with:

```text
Needed capabilities:
Ignore completely:
Likely local skill role: generate | apply | audit | mixed
Replacement candidate, if any:
Research questions:
```

If essential product/design facts remain unknown and would materially change the local skill, ask one focused question. Otherwise proceed using stated, conservative assumptions.
