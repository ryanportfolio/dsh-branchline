---
description: "Review, audit, or stress-test recent code changes with fresh independent agents. Needs exposed multi-agent tools or authed Codex CLI."
---

# Impartial review

You are reviewing work that was probably written too fast — possibly by you. Your job is to find what's wrong, not validate what's right. **If you wrote the code yourself, look harder, not softer.** Bias toward finding real issues, even at the cost of being uncomfortable.

The hardest bias to overcome is defending code you just wrote. The fix is mechanical: dispatch the actual review to fresh-context reviewer subagents that have not seen the conversation that produced the code. Your job in the main session is to gather the diff, brief the subagents, and consolidate findings.

This is a two-stage split, and the stages have opposite jobs. The subagents maximize **coverage** — find everything, including uncertain and low-severity issues. You, holding the full diff and the reviewer reports in one context, supply **precision**, verifying each finding before it reaches the human. Over-reporting upstream of a strong verifier is the design, not a flaw: it is the main model's job to review the subagents' work, not to rubber-stamp it.

When the diff extracts repeated operations or changes a shared boundary, read
[selective shared-code refactoring](references/shared-code-refactoring.md)
and include its applicable caller and invariant checks in reviewer briefs.

## Step 1: Identify scope

Use `$ARGUMENTS` if the user named a specific scope (file path, PR number, "the Q&A changes", commit SHA, etc.). Otherwise default to recent work in this priority order:

1. `git status` and `git diff` — uncommitted changes
2. `git log -1 --stat` and `git show HEAD` — most recent commit
3. If there's an open PR on the current branch, include the full PR diff (`git diff origin/main...HEAD`)

State the scope you're reviewing in your first sentence so the user can redirect if it's wrong. Also count the changed lines (`git diff <range> --stat | tail -1`) — you'll need this for Step 2.

**Freeze the scope with the snapshot script.** For any review of uncommitted or untracked work, or any diff over about 1500 lines, run `scripts/snapshot.mjs` from this skill's folder instead of assembling the diff by hand. The script always snapshots the checked-out working tree, so its head is that tree. To review a commit, branch or range whose head is not checked out, or a checkout with unrelated local edits, first create a clean worktree at the requested head (`git worktree add --detach <dir> <head>`) and pass `--root <dir>`:

```bash
node <this skill>/scripts/snapshot.mjs --base <ref> [--merge-base] [--root <dir>] [--exclude <report dir>]
```

`--base` defaults to `HEAD` (uncommitted work only); use `--base origin/main --merge-base` for a branch or PR. The script compares the base with the working tree, untracked files included, and writes a folder under `.tmp/review-snapshots/` holding `base/` and `head/` copies of the changed files, `scope.patch`, `source-inventory.json` (path, status, SHA-256, absolute paths, scope hash) and `BRIEF.md`. It converts CRLF to LF before diffing, so a pure line-ending flip is listed as `eol-only` and stays out of the patch. Copies and patches over 48 KB or 1800 lines are also split into pages that fit the Read tool. The brief ends with a JS/TS import check that lists `unresolvedDeps`. The script exits 1 without writing the inventory when a changed path is missing from the patch; fix the cause, never review a partial patch. Exclude task-owned report folders with `--exclude`.

When the caller already supplied a snapshot (a `BRIEF.md` path), use it as is. When this session cannot write files, for example a Manager launched in a read-only sandbox, do not run the script: use the git commands from the scope, record the run ID, absolute workspace, base/head SHAs and untracked path/content hashes by hand, and state in the report that the scope was not frozen.

Findings are bound to the snapshot's scope hash. Before accepting findings, run `node <this skill>/scripts/snapshot.mjs --verify <snapshot dir>`; it exits 1 and lists the paths when the working tree has moved on, or when a snapshot copy, page or patch file no longer matches the hash recorded for it. Findings on drifted paths are stale and need renewed review; an altered snapshot file needs a fresh snapshot. For a committed range with no local changes, a plain `git diff <range>` is enough; still record the run ID, absolute workspace and exact base/head SHAs.

**Author brief (optional).** When the caller supplies one, or when you are reviewing work this session wrote, write a short brief of facts: the goal in one or two sentences, the files or behaviors most likely to break, related work in flight (other PRs, merge order), and the checks already run with their results. No verdicts or opinions ("I believe this is correct", "this part is fine"): the brief says what the change is for, never whether it succeeded. Only the Bucket F reviewer sees it (Step 2). With no brief, skip Bucket F.

## Step 2: Pick review mode

**Mandatory:** read [the review buckets](references/buckets.md) completely before picking a review mode in Step 2 and before writing any reviewer prompt. It defines Buckets A–G and the bullets each prompt pastes.

- **Tiny diff (< 50 changed lines, single file, no schema/auth/cache code):** use one fresh leaf reviewer covering all relevant buckets, including project rules.
- **Everything else:** cover all five buckets with fresh reviewers, one per bucket, in bounded batches (see Step 3).
- **Open lens (everything but a tiny diff):** add one Bucket G reviewer. The five buckets are shaped for application code; an animation, a build script, or a UI change can carry its main risk in a lens none of them names. Bucket G picks that lens itself.
- **With an author brief:** add one Bucket F reviewer at either size. Buckets A–E stay diff-only, so the review keeps a layer that never sees the author's framing.

Preserve independent context at every size. If risk is unclear, use the broader coverage.

**Strict quality mode (opt-in):** for a strict, harsh, or deep maintainability review request, load `strict-quality-rubric.md` from this folder and append it to the Bucket D ("things the author missed") subagent's prompt, because maintainability gaps fall in that bucket. The rubric adds six checks that block unless the author gives a reason (Size, Reach, Layers, Types, Ownership, Partial failure) on top of the normal buckets; correctness review stays the same.

## Step 3: Dispatch independent reviewers

Give each reviewer a self-contained prompt and fresh context without the conversation that produced the code. Check exposed capacity first, counting Manager and other active agents. State the worker bound; launch only the reviewers that fit, wait for completion, and release slots when supported before the next batch. With four total slots and Manager active, at most three reviewers run together. For the tiny-diff path, combine the relevant bucket rules and project reading into one brief.

**Reviewer model tier.** Honor explicit user model choices and required quality floors; otherwise inherit the configured session model. Inspect actual model exposure. If a requested model or floor is unavailable, disclose the gap rather than silently substituting or inferring model quality from a name.

**Dispatch from Claude Code.** Send the current batch of `Agent` tool calls together, within available capacity. Each uses `subagent_type: "general-purpose"` with fresh context and the model selected above.

**Dispatch from Codex.** Check what the session exposes before assuming; a config flag is not proof. With multi-agent tools, dispatch the selected reviewers in bounded batches with the selected model settings. Without them, check authenticated Codex CLI and run one read-only `codex exec` process per selected reviewer with bounded concurrency: each is a new process, so the fresh context is structural rather than promised. Every child gets the leaf-reviewer line the prompt templates below carry: a `codex exec` process that finds this skill and dispatches its own five turns one review into twenty-five.

**Mandatory for the `codex exec` route:** before launching any reviewer process, read [Codex CLI dispatch commands](references/codex-cli-dispatch.md) and follow it exactly.

Give every run its own `$RUN` directory. Require each process to exit successfully with a non-empty new report, and record its exit status, report hash, and observed model/effort. A report with failed inspection has incomplete coverage despite exit 0. Recheck source identity before accepting findings. Follow `codex-review` for bounded process monitoring; log silence alone does not establish a stall.

`gpt-6.1-sol` is an example configuration, not proof of availability. Inspect current local help/auth first. If a model is rejected, report the failure; any usage-consuming retry or fallback needs existing explicit authorization or user agreement. Record the requested and actually reported model separately, using "unverified" when the process does not reveal resolution. If neither agents nor an authenticated CLI can supply fresh context, disclose the missing independent review; self-review cannot replace it.

Reviewers spawned from Codex share the author's vendor, so this buys fresh context, not a cross-vendor second opinion. Say which one you ran rather than implying vendor independence.

Each prompt must include:

1. The scope. With a snapshot, paste its `BRIEF.md` verbatim: it carries the absolute snapshot and workspace paths every reviewer resolves against, the patch parts, the scope hash, and the dependency note. Without one, paste the diff inline if < ~1500 lines, otherwise give the exact `git` command and the commit range/branch.
2. Their assigned category bucket (below).
3. The verification rule from Step 4.
4. The severity scheme from Step 5.
5. The per-finding output format from Step 6.
6. An instruction to **only** report findings in their bucket — the main session deduplicates and merges.
7. The plan-mode rule: reviewers never enter plan mode, write a plan, or wait for approval. A report that is a plan, or that stops to ask for approval, is a failed review: rerun that reviewer.

Never put the author brief in a Bucket A–E or G prompt, including the tiny-diff reviewer's; it goes to Bucket F only.

For a full review, Bucket E (project-aware) gets an **extended** prompt; the other four use the standard template. For a tiny diff, combine the relevant instructions into one prompt and remove statements that assume other reviewers exist.

**Mandatory:** before dispatching any reviewer, read [the sub-reviewer prompt templates](references/sub-reviewer-templates.md) completely and build every reviewer prompt from it verbatim (A–D standard, E extended, F and G variants). Never hand-write a prompt that drops its leaf-reviewer, plan-mode, verification, severity, confidence or output lines.

## Step 4: Verification rule

For every potential issue, run a real check before asserting. `grep` for call sites. `Read` the file. Open the consumer and look. Plausible-sounding-but-unchecked claims waste the human's time when they re-investigate and find the claim was wrong. A check your sandbox blocked is not a check you ran: name it and tag the finding LOW.

This rule is repeated inside each subagent prompt, but it also applies to the single reviewer for tiny diffs and to the merging step in Step 6 — don't paper over a subagent's unverified claim by passing it through.

## Step 5: Severity tags

🔴 **BLOCKING** — Real bug, regression, schema drift, security/privacy issue, or data correctness problem. Should not merge.

🟡 **SHOULD-FIX** — Edge case that will eventually bite, observability gap, inconsistency, minor parity issue between code paths. Should be fixed but not blocking.

🟢 **NITPICK** — Style preference, future polish, deferable consideration. Mention it but make clear it can be skipped.

**Grade against the change's goal.** A finding limited to another code path, a rare input, a small performance cost, or extra compatibility is 🟢 unless it breaks what the change sets out to do; security, auth, and data-loss findings keep their impact severity. Code, tests, guards, or options the goal does not need are a 🟢 finding whose fix is the smaller version. Apply this when you re-rank in Step 6, whatever label the reviewer gave; review loops otherwise grow a change one cheap-looking fix at a time.

## Step 6: Merge subagent findings and present

When the selected reviewers return — **this is the precision stage.** The subagents over-reported on purpose (coverage); your job is to verify and rank so the human gets a trustworthy list. You hold the full diff, the project, and all reviewer reports at once; reviewers received only their assigned scope and constraints. That is what makes this verification worth its cost. Reviewing the subagents' work is the point — do not rubber-stamp it.

0. **Check scope and form.** Run `snapshot.mjs --verify <snapshot dir>` when a snapshot was used. A finding whose `Scope:` differs from the run's scope hash, or that sits on a path `--verify` reports as drifted, is stale: set it aside for renewed review instead of verifying it against code it never saw. A report that is a plan, asks for approval, or has a finding without the `Scope` / `Evidence` / `Files read` lines is a failed review for that bucket: rerun it or list the bucket as uncovered. A report with no findings needs none of those lines.
1. **Deduplicate — and read agreement as signal.** Two agents may flag the same issue from different angles — merge into one finding, keep the higher severity. Bucket E findings often overlap with A/B/C/D (e.g., a cover-identity leak is also a correctness issue) — merge but preserve E's rule citation so the human sees *why* it's a violation. The same issue surfaced independently by two or more subagents is high-confidence signal: note the agreement on the merged finding ("flagged independently by A and D") and weight it accordingly when you verify. A lone-agent finding is still worth verifying, just with lower prior.
2. **Verify every finding you intend to surface — across all severities, not just 🔴.** The finding stage deliberately over-reported, including LOW-confidence items; turning that into precision is your job. For each finding, run a real `grep`/`Read` to confirm before passing it to the human (for Bucket E, open the cited rule file and confirm the rule actually says what the agent claimed — paraphrased rules are the most common Bucket E failure mode). Treat the 🔴s adversarially: a fresh-context subagent in a hurry is exactly the kind of reviewer that produces plausible-but-wrong blockers, so try to *refute* each one before you accept it. Verify against the same snapshot copies the reviewer read (`head/` and `base/`, or the workspace for unchanged files), never a different checkout. When you and a reviewer disagree, settle it there: cite the snapshot lines you read and, when a command decides it, run it and record the result.
   - **Own the confidence filter — but drop only on evidence.** A finding tagged LOW-confidence gets *confirmed* (verify, then promote and re-tag), *refuted* (drop it from the findings list and record it under "Dismissed" with the reason), or *kept as LOW* with a one-line note on the residual uncertainty. Drop a finding **only because you checked and it isn't real** — never because it "seems minor" or "seems unlikely." Filtering on vibes here re-introduces exactly the recall loss the coverage-first finding stage was built to prevent.
3. **Tag each finding's source** when Bucket F ran: *blind* (A–E or G, the reviewers that never see the brief), *intent* (F only), or *both*. Intent-only findings are what the brief made visible. A blind-only finding that sits in an area the brief called risky or covered means the brief may have steered F away from it; say so in the report.
4. **Severity-order globally.** All 🔴 first across all buckets, then all 🟡, then 🟢 — not bucket-by-bucket and not in the order agents returned.
5. **Present in this format:**

```
## 🔴 Short title of the issue
`path/to/file.ts:123`
Scope: [scope hash prefix or git range] · Evidence: read-only | executed: [commands and results] · Files read: [absolute paths]

[Concrete description: what's wrong, what triggers it, what the impact is.]

**Fix:** [Specific edit to make.]
```

After the findings, include:

```
## Things I checked and verified fine

- [Suspicious-looking item that's actually OK, with a one-line reason. Merge
  these from the reviewers so the human doesn't re-investigate.]

## Dismissed

- [Every subagent finding you refuted during verification, with the one-line
  reason it's wrong or missing context. Never silently drop a finding: showing
  the dismissal lets the human override your judgment.]

## Recommendation

[Which fixes are blocking merge, which can be a follow-up, which can be skipped.
Be concrete about merge readiness.]
```

If every reviewer returned zero findings and your verification confirms, report the actual reviewer count, covered buckets (including whether Bucket F ran), and any unavailable checks.

In every report, list any standard bucket (A–E) that had no reviewer, each with a one-line reason tied to the diff ("C: animation-only change, no input or data handling"), and the lenses Bucket G chose with its stated reasons. A skipped bucket is a stated decision, never a silent one. A clean result is valid; do not infer missed defects from the finding count alone.

## Anti-patterns to avoid

**Mandatory:** before presenting the Step 6 report, read [the anti-patterns](references/anti-patterns.md) and check the report and your verification against every item.
