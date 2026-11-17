# Preconditions, known-path replay, estimate

All done by main session before any walker starts. `W` below = `node .claude/skills/user-walk/scripts/walk.mjs` (Codex: `.agents/skills/user-walk/scripts/walk.mjs`).

## 1. Target

URL walkers use: local dev server, preview deploy, or production of an app the owner owns. Prefer local or preview with seeded data. Production only with a test account, and never on real users' data.

Map the code the target serves, not whatever is checked out: find the commit it runs (local: `git rev-parse HEAD` of the served checkout; deploy: the host's deployment commit, e.g. `vercel inspect`, or a version endpoint). Map that commit; if it is not `origin/<default>`, say so in the map header. Unknown → redeploy or serve the mapped commit before replay. Otherwise a mismatch between code and screen looks like a product bug.

## 2. Account and data

- Signed-out features need nothing.
- Signed-in features need a test account or seeded data. Ask owner. Credentials through a file owner pastes into (`secret-file` skill where installed), never in chat.
- Make signed-in state once: `W <run>/login start --url <login page>`, then `W <run>/login fill <ref> --from-file <secret file>` for the password (value never reaches a command line or log; plain `fill` for the user name), `click` to sign in, `W <run>/login save-state <run>/auth.json`, `W <run>/login stop`. Pass `--storage-state <run>/auth.json` to every replay and walker driver. Keep `auth.json` out of reports, screenshots shared outside the run, and commits. Delete it at cleanup.
- Login itself is not walked from saved state. Walking sign-in or sign-up as a goal → start signed out; sign-up decisions → `conversion-ux`.
- Apps that allow one session per account may sign out parallel walkers: run signed-in goals one at a time there, or give each walker its own test account.
- Features needing data that does not exist (an empty account has no history to export) → seed it first or list as not walked.

## 3. Skip list

Driver refuses click, select, Enter and Space when the control's text, label, title, value or the control it sits in matches its default list: delete, remove, destroy, erase, wipe, discard, trash, empty, clear all, reset, revoke, pay, payment, purchase, buy, checkout, place (your) order, order now, complete order, book now, donate, transfer, upgrade, subscribe, unsubscribe, send, reply, invite, share, publish, post, tweet, cancel plan/subscription/account, close account, deactivate, leave. Enter in a field also checks its form's submit buttons, or the buttons near a field outside any form (chat boxes). `press` takes navigation keys only, so app shortcuts (Delete, letters, Control+Enter) cannot fire.

The driver sees words only, not what a control does. So read each walked feature's write paths in code: any control that emails, messages, charges, deletes, or calls a third party with side effects goes on the list under its visible words (`--skip "archive|notify team|run export to S3"`). Icon-only controls with no label, title or text give the driver nothing to match: find them in code and add a `--skip` that matches a nearby word, or list the feature as not walked. Ask owner for anything else walkers must not touch. `--skip` adds to the default list; it never replaces it.

## 4. Origins

Driver undoes any landing on another origin (link, redirect, form post) and logs it as "left the app"; popups to other origins are blocked and closed; non-GET requests to other origins are aborted. A start URL that redirects (www to apex, app to its sign-in host) adds the landing origin, and `start` prints it. Replay (step 5) writes `blocked.jsonl`. App needs its own API or sign-in host on another origin → confirm with owner → `--origin https://api.example.com` on every driver. Analytics and ad hosts stay blocked. A redirect's first hop to another origin still reaches that server before the driver undoes it; keep payment and mail flows on the skip list.

## 5. Known-path replay

For each goal, main session runs its known path through driver in `<run>/known-<n>/`:

```bash
node .claude/skills/user-walk/scripts/walk.mjs .tmp/user-walk/<run>/known-4 start --url <start> --goal "<goal>" --shots <shots root>/known-4 [--storage-state <run>/auth.json]
```

then `look` + one action per step, `end found`, `stop`. Two checks on the last screen, both from the screenshot and page text:

- scroll until the control or answer is on screen, counting each `scroll` (driver refuses off-screen controls for walker and replay alike; trial: a 1-click path really took 1 click + 5 scrolls);
- read it: does it complete the goal? A page whose heading matches is not enough (trial: "What happens to your data?" never said whether submitted URLs are kept). No answer anywhere → Known steps `none`, a content finding; still walk it, to see where users look.

Result:

- `summary` shows `failed` or `refused` above 0 → not a measurement: fix the step and replay in a fresh folder until clean; record only clean counts;
- clean measured known steps → map's Known steps;
- path broken (control missing, gated, error) → fix map; if code says it should work, it is a product bug for report;
- shorter path found while replaying → update map;
- seconds per action → estimate below.

## 6. Estimate and budget

- Per-goal action budget for walker: `--max-actions` = max(15, 4 × known steps). Known `none` → leave out `--known`, use `--max-actions 15`.
- Measured pace (willaicite.com trial, 2026-11-14, 6 goals of 1 to 6 actions): 38 to 64 s per walker agent, about 110k tokens each (page text per `look` dominates).
- Time per goal ≈ 25 s + 6 s × (known steps + 3). Total ≈ Σ per goal ÷ walkers at once (max 4) + replay time (seconds; driver start ≈ 2 s).
- State estimate before walking, time and tokens: `9 goals, 4 at a time, about 3 min, about 1M tokens`. Past 2× time → stop, report what finished, rethink.

## 7. Progress

One line per finished walker. `W <run> summary` anytime: live counts for every walk folder.
