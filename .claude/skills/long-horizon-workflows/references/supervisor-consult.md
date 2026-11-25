# Cross-vendor supervisor consult on stagnation

Read when a Stagnation trigger fires and you consider a Codex consult. Launch section below
also serves [draft-review.md](draft-review.md).

Either trigger may escalate to cross-vendor supervisor. Manager, executor, auditor all Claude
→ shared blindspots, which is exactly how plateau looks from inside. Codex = different model
family, never saw this session:

```bash
node "$RUNNER" --preflight   # $RUNNER: lookup under Launch
```

Exit 0 (`ready`: ChatGPT login, or a `model_provider` gateway set in `config.toml` in
`$CODEX_HOME`, default `~/.codex`): one Codex run (custom prompt, no scope selector) carrying
contract, audit log, Dead ends; asks plateau diagnosis + different strategy. Launched by the
Manager per Launch below, outside any round script. Answer = opinion: check vs current
contract version + acceptance checks before it rewrites Remaining; drop anything that drifts.
Exit 1 (not ready), or run fails per Launch: skip; rewrite rules above stand alone.

## Launch

Every launch goes through the shared runner `$RUNNER` (lookup below; README beside it);
never hand-build `codex exec`. Preflight above → JSON (CLI version, login or gateway, role
pins). Model: `ROLE=sol` (newest Sol; role default effort high). Pins live
only in `models.json` next to the runner in use. Newer model in catalog → tell the user;
update `models.json` only with the user's OK, never edit pins here. An explicit user model or
effort choice wins (`--model`, `--effort`). Never drop `--role`/`--model`.

One new directory per run, never reused: consult `evidence/codex-consult-1`, draft review
`evidence/round-<N>/draft-review-1`, under task dir `.tmp/long-horizon/<task-slug>/`; a retry
or follow-up review takes the next free number. `mkdir` without `-p` fails on an existing
directory: stop there and take the next number. Runner output goes to `$RUN/codex` (runner
refuses an existing non-empty dir; `$RUN` holds prompt, meta). Prompt via `--prompt-file`
(runner pipes it to stdin `-`), so no shell quoting touches it.

```bash
RUN=<absolute task dir>/evidence/codex-consult-1     # or evidence/round-<N>/draft-review-1
mkdir -p "$(dirname "$RUN")" && mkdir "$RUN"          # then write the prompt to "$RUN/prompt.md"
```

`$RUNNER` lookup, in the same command as preflight and every launch (working directory stays the target repo): the repo's own runner, then the one shipped beside this skill, then the user install. None found → tell the user; Codex unavailable.

```bash
for RUNNER in .claude/scripts/codex-run/codex-run.mjs "<this skill's folder>/../../scripts/codex-run/codex-run.mjs" "$HOME/.claude/scripts/codex-run/codex-run.mjs" ""; do [ -f "$RUNNER" ] && break; done
test -n "$RUNNER" || echo "codex-run runner not found: tell the user"
```

```bash
test -n "$RUNNER" && test -n "$ROLE" && test -s "$RUN/prompt.md" && test ! -e "$RUN/codex" && { echo $BASHPID > "$RUN/pid"; node "$RUNNER" --out "$RUN/codex" --role "$ROLE" --effort "${EFFORT:-high}" --sandbox read-only --timeout-min 30 --label "long-horizon-workflows $RUN" --prompt-file "$RUN/prompt.md" > "$RUN/runner.log" 2>&1; echo $? > "$RUN/exit-code"; }
```

Set `RUN`, `ROLE` and `RUNNER` in the same command: a new shell call does not keep them. User named a
model → `MODEL=<id>`, swap `ROLE` for `MODEL` in the first guard and `--role "$ROLE"` for
`--model "$MODEL"`. Set `EFFORT` only when the user chose an effort other than high. Four
`test` guards keep Codex from starting without a runner, without a model, without a prompt, or into a directory
already holding a run. `pid` = shell waiting on runner (`$BASHPID`, right in background; `$$`
names parent shell); `exit-code` (runner: 0 ok, 1 run failed, 2 bad arguments) written at end,
so restarted Manager tells running from dead: no `exit-code` + `kill -0 "$(cat "$RUN/pid")"`
succeeds → still running; fails → look for `exit-code` once more; still none → failed run.
`--timeout-min 30` = choice, not measured: runner kills process tree, `reason: timeout`, a
failed run. Non-Git workspace → add `--skip-git-repo-check`.

Launch from main workspace root as background process (Bash `run_in_background`). Foreground
tool call dies at harness's 10-minute ceiling and takes run with it. Progress:
`$RUN/codex/status.json` (first write after 30 s; `running` → `done`/`failed`; `events`,
`elapsedSec`). Before launch record in `$RUN/meta.md`: workspace, contract version in prompt,
CLI version (preflight), command, requested role/model + effort, start time. After exit add
end time and, from `$RUN/codex/result.json`: `ok`, `reason`, `observed` model/effort/sandbox,
`threadId`, `usage`. `observed` null or a `warnings` entry → report as requested, resolution
unverified.

**Accept** answer only when `exit-code` is 0, `$RUN/codex/result.json` has `ok: true` (runner
checks non-empty report, observed model + sandbox), and report non-empty. Report =
`$RUN/codex/last.md` (final message). Map `reason`: `model_rejected` → never swap or drop the
model; follow `codex-review` Step 4. `model_mismatch`, `sandbox_mismatch`, `timeout`,
`nonzero_exit`, `empty_report` → failed run: one retry in a new run dir, same prompt. Second
failure → stop retrying, record both `reason`s; consult → skip (rules above), draft review →
fresh Claude subagent outside round script per `draft-review.md`.
