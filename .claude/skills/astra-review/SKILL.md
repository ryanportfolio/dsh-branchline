---
name: astra-review
description: "Cross-vendor review on newest Astra (codex-run role astra, medium). Same lifecycle as codex-review. Use: /astra-review, 'have Astra review this'."
disable-model-invocation: true
---

# Astra review

Read `.claude/skills/codex-review/SKILL.md` and follow its complete execution contract: runner `--preflight`, exact scope, unique run directory, source manifest, launch path (external-review first, selector fallback), background launch with `status.json` polling, `result.json` evidence, finding verification, and honest attribution. Launch Codex only through the trusted runner `node "$RUNNER"` that codex-review Step 0 resolves (default branch copy, else the installed skill's runner outside the reviewed checkout, else the user's install, never the reviewed checkout's copy without the user's confirmation), run from the repository root; never hand-build a `codex exec` line. This entrypoint changes only the defaults:

| Setting | Astra default |
|---|---|
| Runner role | `--role astra` (model and effort from `.claude/scripts/codex-run/models.json` `roles.astra`) |
| Effort | the role default (`medium`), regardless of diff size |
| Run directory | `RUN=$(mktemp -d .tmp/astra-review-XXXXXXXX)`, runner `--out "$RUN/codex"` |

Commands are the ones in codex-review's [launch example](../codex-review/references/launch-example.md), with `--role astra` in place of `--role sol` and the `astra-review` run directory prefix. Commit and uncommitted prompts, the root-commit and dirty-tree rules, the skill-load and scope-identity checks, and path attribution follow `codex-review`. `$ARGUMENTS` carries scope as in `codex-review`.

Skip the newest-Sol check in `codex-review` Step 1; this entrypoint never swaps Astra for Sol. Check for a newer Astra instead: when `codex debug models` lists an Astra slug newer than `roles.astra.model`, run with `--role astra --model <newer id>` (the role keeps effort medium) and tell the user the pin is stale. Update `models.json` only with the user's OK. Honor an explicit user model choice: keep `--role astra --model <id>`; add `--effort` only when the user picks one. A model identifier in `models.json` is not proof of availability.

Distinct prefixes do not prevent collisions between two Astra invocations; every run directory must still be new.

If Astra is unavailable, report that outcome. Do not silently inherit another model or attribute a fallback to Astra. A `result.json` with `reason: model_rejected` is reported, never retried on another model. Any other failed `reason` gets the one automatic retry from `codex-review` in a new `--out`; changed source gets none. Attribute the result to the `observed` model and effort in `result.json`, or explicitly mark model resolution unverified. Keep lifecycle fixes in `codex-review` rather than forking them here.
