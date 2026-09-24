# Skill Provenance

Where each skill came from, its license, and what this repo changed. Not loaded
into context; it is reference for maintainers and public users.

**Maintenance rule:** when you materially change a forked skill, update its
"Our deltas" cell here. When adding a third-party skill, add a row and keep its
LICENSE/NOTICE files in the skill folder.

## Forked / third-party

| Skill | Upstream | License | Our deltas |
|---|---|---|---|
| `brainstorming` | [obra/superpowers](https://github.com/obra/superpowers) (Jesse Vincent) | MIT (in folder) | Two-lane scope calibration, authorization-safe artifacts, optional visual companion; added an original shared-code refactoring reference for caller compatibility and scoped design decisions. |
| `writing-plans` | obra/superpowers | MIT (in folder) | Proportionate plans, useful interfaces and checks, authorized continuation; removed mandatory complete-code duplication and execution-choice gate. Native Codex implementation retained. Added an original shared-code refactoring reference for staged changes and caller verification. |
| `writing-skills` (retired entrypoint) | obra/superpowers | MIT (in both legacy folders) | SKILL.md retired; legacy manuals, examples and scripts retained outside discovery in both runtime folders. Condensed authoring/evaluation guidance moved into addskill with copied MIT license; universal failure-first and automatic publication requirements removed. |
| `addskill` authoring resource | obra/superpowers writing-skills | MIT (`references/LICENSE` in both runtime folders) | Adapted discovery, structure and behavioral evaluation guidance into optional local authoring references; end-to-end addskill workflow remains homegrown. |
| `caveman` | Community token-compression pattern (viral skill, author attribution unclear) | Reimplemented here | Intensity tiers, clarity carve-outs, persistence and built-in session cleanup; removed unsupported savings claim and duplicated kernel digest. Explicit prose and scoped code-diff cleanup remain available through existing routes. |
| `writing` | Wikipedia "Signs of AI writing" tell catalog (CC BY-SA 4.0); `unslop` in [cursor/plugins pstack](https://github.com/cursor/plugins/tree/main/pstack) (Lauren Tan, MIT); Hermes Agent `purposeful-writing` (Nous Research, MIT); [petergyang/no-ai-slop](https://github.com/petergyang/no-ai-slop) (Peter Yang, MIT); [ItsssssJack/SlopMonster](https://github.com/ItsssssJack/SlopMonster) (MIT) | Notices in `NOTICE.md` and MIT `LICENSE` in both runtime folders; our text MIT | Consolidated outward-facing prose and explicit cleanup, preserving optional pattern/provenance resources; patterns 35-45 and edit restraint from no-ai-slop, pattern 31 rulings from Corewise.Academy plain-words (2026-07-18). User voice overrides style defaults; ordinary chat uses Caveman, drafting needs no review verdict. Kernel now routes to skills instead of duplicating the digest. Both runtime packages are standalone; added evidence checks, reader restatement, scoped review verdicts, and purpose-dependent explanation length. |
| `refine` | Concept from [PrimeIntellect-ai/prime-agent](https://github.com/PrimeIntellect-ai/prime-agent) Continual Harness `/refine` (MIT); no code or text vendored | Reimplemented here | Cause-specific diagnosis, narrow scope, static validation for nonbehavioral fixes and baseline/candidate evaluation for material changes; delegates to recall/addskill, with separate publication authority. Material-change record informed by [RSI survey](https://arxiv.org/html/2609.11873v1), in original wording. Pre-edit attribution, causal-link and active-lever checks, plus the observation-first diagnostic, informed by the `failure-mode-checklist` editor skill in [IQuestLab/ModularRSI](https://github.com/IQuestLab/ModularRSI) (CC BY-NC 4.0 for its research contributions); concept only, no text vendored. Local acceptance, later use and measured benefit remain distinct; both runtime evaluation resources stay identical and self-contained. |
| `long-horizon` | Concept from [AMAP-ML/LongHorizon-Harness](https://github.com/AMAP-ML/LongHorizon-Harness) (MIT); no code or text vendored | Reimplemented here | Durable manager/executor/auditor rounds, frozen pre-dispatch audit brief, actual dirty/untracked artifact identity, verdict triple, fresh context and final integrated audit. Default thresholds trigger reassessment; explicit budgets bind. Runtime model/tool exposure and user choices govern dispatch; no inherited-context substitute for independent audit. |
| `long-horizon-workflows` | Concept via this repo's `long-horizon` (itself a concept port of [AMAP-ML/LongHorizon-Harness](https://github.com/AMAP-ML/LongHorizon-Harness), MIT); no code or text vendored | Reimplemented here | Claude-only. Carries the `long-horizon` contract unchanged and runs each round's baseline, executor, inspector and judges as one `Workflow` tool script: audit prompts built only from script arguments, schema-enum verdicts, a run journal with resume, and a per-round judge count with rotating lenses. Added in #136. |
| `bro` | Concept from [cursor/plugins `pstack`](https://github.com/cursor/plugins/tree/b42effe/pstack) `bro` (Lauren Tan, `poteto`; MIT); no text vendored | Reimplemented here | Opens with what the user must do or decide, keeps every fact and caveat while coming in shorter than the original, and adds a plainest-prose pass for drafts under `writing` rules. |
| `babysit-ci` | Concept from [cursor/plugins `cursor-team-kit`](https://github.com/cursor/plugins/tree/b42effe/cursor-team-kit) `loop-on-ci`, `fix-ci`, and the `ci-watcher` agent (Cursor; MIT); no text vendored | Reimplemented here | Separate watch and fix modes, `gh pr checks` as the source of truth, a stop after three fix pushes, a `fable-mode` rethink when a failure survives its fix, and a report that each fix push leaves a head the cross-vendor review (`/codex-review` in Claude, `$claude-review` in Codex) has not seen. |
| `fable-mode` verification (claim classes, verdict words) | Concept from cursor-team-kit `verify-this` (Cursor; MIT), retired here as a separate skill 2026-09-23; no text vendored | Reimplemented here | Current-state, change, and cause claims each get their own evidence bar (observed output, identical-command baseline, isolation by revert or controlled change) and end in VERIFIED, NOT VERIFIED, or INCONCLUSIVE inside the single-context method. |
| `refine` preference-evidence rules | Concept from pstack `automate-me` (Lauren Tan; MIT) and cursor-team-kit `workflow-from-chats` (Cursor; MIT); `automate-me` retired here 2026-09-23; no text vendored | Reimplemented here | Grades preference evidence from the user's own turns in the current project only and routes each confirmed rule to one home (global kernel, project kernel, pitfalls, reference file, or skill) instead of drafting a personal mode skill. |
| `impartial-review` `strict-quality-rubric.md` | Concept from cursor-team-kit `thermo-nuclear-code-quality-review` (Cursor; MIT); no text vendored | Reimplemented here | Opt-in rubric for the Bucket D reviewer framed as cost of the next change: one-line verdict, eight evidence questions, six of them blocking unless the author gives a reason; packaged byte-identical in both runtimes. |
| `wow-loop` browser rules | Concept from cursor-team-kit `control-ui` (Cursor; MIT); no text vendored | Reimplemented here | Travels in every page-driving subagent brief and binds launch to this repo's headed `launchPlacedChrome()` path with one browser per session. |
| `caveman` `references/diff-cleanup.md` | Concept from cursor-team-kit `deslop` (Cursor; MIT); no text vendored | Reimplemented here | Removes only justified noise from a requested diff, keeps defensive code and caveats, and sends prose inside the diff to `writing`. |
| `.claude/reference/pitfalls.md` cross-cutting engineering gotchas | Concept from cursor-team-kit `make-pr-easy-to-review` and `pr-review-canvas` (Cursor; MIT); no text vendored | Reimplemented here | Three recorded gotchas: fetch then compare tree hashes around a history rewrite, escape `<`, `>`, `&` in JSON inside `<script>`, and bind background dev servers to an explicit loopback port. |
| `arena` | Concept from pstack `arena` (Lauren Tan; MIT); no text vendored | Reimplemented here | Puts one candidate and the blind judge on the other vendor by default (Codex from Claude and the Claude CLI from Codex, each only on a proven subscription login), isolates each candidate in its own worktree or folder, keeps the label map from the judge, has the parent rescore every candidate against 3 to 6 checkable criteria, organizes the run around a scratch folder whose read and write rules carry the blinding, allows one rerun (split premise or a verification failure traced to the brief) before asking the user, and holds Claude workers to an Opus or Fable floor. |

## Homegrown (this repo)

`addskill`, `adopt-repo`, `advocate`, `astra-fullreview`, `astra-review`,
`claude-review`, `codex-fullreview`, `codex-review`, `dare`, `enhance-prompt`,
`external-review`, `fable-mode`, `forge-repo-ui-skill`, `handoff-audit`,
`impartial-review`, `init-project`, `lab`, `optimize-context`, `perf-loop`,
`recall`, `session-hub`, `showpiece`, `sync-starter`, `why`, `wow-loop`.

Homegrown skills are MIT, same as the repo (see the root `LICENSE`).

Runtime coverage follows `.agents/skill-capabilities.json`: `astra-fullreview`,
`codex-fullreview` and `long-horizon-workflows` are Claude-only, `external-review`
is Codex-only, and every other active skill ships in both runtimes. `recall` and
`why` share names with unrelated pstack skills; ours predate the pstack ports
(initial release, 2026-07-04) and do different jobs.

The `evidence-report.md` references in `perf-loop` and `wow-loop`,
and the `shared-code-refactoring.md` references in `brainstorming`,
`external-review` (Codex only), `impartial-review`, and `writing-plans`, use concept-only inspiration from
[`michaelshimeles/skills` at `513f8a24aae6383b00356fa285144b1bc3730dc1`](https://github.com/michaelshimeles/skills/tree/513f8a24aae6383b00356fa285144b1bc3730dc1).
Both resources were authored here in original wording and packaged in both
runtimes. No upstream source text was copied; this attribution makes no claim
about the upstream repository's license.

`perf-loop` now has a Claude entrypoint adapted from the repository's native Codex workflow,
with the same three domain references and measurement gates. Dispatch remains runtime-specific.
The full 36-name maintenance ledger and retained behaviors are in
[`docs/research/2026-09-14-skill-parity-changes.md`](../../docs/research/2026-09-14-skill-parity-changes.md).
That ledger is a 2026-09-14 snapshot: it still lists `merge` (since removed from the
template), `automate-me` and `verify-this` (retired 2026-09-23), and predates
`long-horizon-workflows` (#136), `external-review`, `codex-fullreview` and
`astra-fullreview` (#143).

`forge-repo-ui-skill` is an original synthesis workflow. It researches linked
third-party sources as untrusted inputs but does not vendor their skill text,
scripts, datasets, licenses, or configuration.

`.agents/skills/humanizer/patterns.md` is not a skill: it has no SKILL.md and no
manifest entry. It is left over from the `humanizer` skill that #103 merged into
`writing`, and its catalog derives from the Wikipedia "Signs of AI writing" guide
(CC BY-SA 4.0), the source already credited in the `writing` notice.
