---
name: redesign-concepts
description: "Built UI → screenshots → Codex image_gen → 10 redesign concepts → owner picks → build plan. Use: /redesign-concepts, \"show what we have to Codex, get 10 better versions\", \"prototype improvements to current UI\". Brief only, nothing built → design-prototypes."
---

# Redesign concepts

Critique an existing build from real screenshots and get generated redesigns of it. The images are design targets, not implementation. This skill does not edit the product, commit images, or deploy. Default to 10 concepts; honor a different count the user asks for.

Script paths below are from the repository root. When this skill came from a plugin or a personal skills folder, run the scripts from the `scripts/` folder in this skill's base directory instead. Either way, run them from the workspace root, because every path they write is relative to it.

## 0. Preflight and cost

- `codex --version && codex login status` must say `Logged in using ChatGPT`. Otherwise stop and ask the user to run `codex login` in their own terminal; never handle credentials.
- Each image costs about 60-70k Codex tokens on the user's subscription, so 10 images is roughly 700k. Say so before starting the batch.
- Pick a fresh scratch dir inside the workspace that git ignores, for example `.tmp/redesign-<n>/`. Codex's `workspace-write` sandbox reads and writes only inside the workspace, so references and outputs both live there.
- Load the project's own UI or art-direction skill or reference first, if it has one, and carry its constraints into the shared identity line.

## 1. Capture

Take real screenshots of the current build at the size its users see: desktop (1440x900) for a desktop product, a phone viewport for a mobile-first one. Use the project's verification setup, following its browser rules. Cover each key screen and state, especially the busiest: first paint, an open menu or drawer, a filtered or search state, an admin or manager view, a detail page. Fresh verification captures can be reused; stale ones cannot.

Keep the originals wherever the project or user keeps screenshots. Copy only the chosen references into `<scratch>/refs/`.

## 2. Critique, then concepts

Read every capture yourself and list the concrete problems this product actually has, for example repetition, too many controls at once, jargon, weak hierarchy, or important things pushed below the fold. Don't assume clutter: a sparse screen can fail by hiding what matters, and a dense tool for experts may need more on screen, not less. From that list, write the design direction every concept shares and who the screens are for.

Write the concepts. Each targets one screen, names the problem it answers, and carries one idea. Vary them across composition, metaphor, hierarchy and interaction; recolors don't count as concepts. If the product has both user-facing and admin screens, mix them. Mark any concept that needs data or backend the product lacks.

## 3. Prompts

Write `<scratch>/concepts.json` (format in the header of `scripts/make-prompts.mjs`). Every field comes from this product and the step 2 critique; none has a default:

- `product`, `audience`: what it is and who uses these screens.
- `identity`: palette roles, type and card style as read from the screenshots.
- `direction`: the design goals every concept shares.
- `orientation`: `landscape` (1536x1024) or `portrait` (1024x1536), matching the captures.
- `negatives` (optional): things this product must not get, beyond the built-in list.
- per concept: `name`, `screen`, `problem`, `idea`, `refs` (the current screen first), and `needs` for data or backend the product lacks.

Then:

```bash
node .claude/skills/redesign-concepts/scripts/make-prompts.mjs <scratch>
```

It writes `prompts/NN-name.txt`, `prompts/NN-name.refs` and `index.md`. Each prompt tells the model the screenshots show the current product and asks for a better version of the same screen, stating the concept's problem and idea, the shared direction, the identity to keep and the real data to reuse. Built in are only the negatives that hold for every project: a near-copy of the screenshot, a different visual identity, device frames, placeholder or garbled text, and more than one screen. Output is an opaque PNG at an exact path.

For example, a light-themed admin app for non-technical staff, whose captures showed too many controls at once, used this direction: "fewer controls visible at once, plain everyday words instead of jargon, one obvious primary action per area, clear grouping, progressive disclosure", with the negatives "dark mode", "a marketing hero" and "emoji". Those choices fit that product; write your own from step 2.

## 4. Generate

```bash
bash .claude/skills/redesign-concepts/scripts/run-batch.sh <scratch> 3
```

It runs three `codex exec` jobs at a time (`-m gpt-6-astra`, medium reasoning, `-c model_provider=openai`, `-s workspace-write`, refs via `-i`, prompt on stdin), logs each to `logs/`, and accepts an output only if it is a PNG of 100 KB or more (smaller means drawn in code or cut short). Invalid outputs are moved to `out/NN-name.rejected.png`; valid ones are skipped on a rerun, so rerunning resumes and retries the failures. If a log shows `401 Unauthorized: Incorrect API key provided` while login status says ChatGPT, check https://status.openai.com before debugging auth; report an outage and stop.

## 5. Review and present

Read every image. Note real flaws: invented labels, a list that shows internal names, garbled text, a concept that copied the screenshot. Regenerate only a clear failure, by deleting its PNG and rerunning the batch, and say what changed.

Send all the images in one go so they display together (in the Claude desktop app, one SendUserFile call with `display: "render"`; elsewhere, list the paths). Then give a numbered one-line summary per image, flag the ones that need new data, and recommend a set with a concrete reason tied to the problems from step 2.

## 6. Fold picks into the build

When the owner picks, write `<scratch>/synthesis.md`, and copy it to wherever the project keeps plans if the work will outlive the session. It resolves conflicts between the picked concepts:

- vocabulary: one word per thing across all screens, with the old terms each replaces;
- which existing features or controls each idea replaces, moves or hides;
- new data or backend each needs, and where it would come from;
- build order.

Then turn it into build work: plan tasks, or quality-loop checks. If the project runs `wow-loop` or a similar contract, add a versioned amendment with named checks for the new design, and name each old check it retires and why (the feature it tested is gone or replaced). Retire checks only for that reason; never relax a check to make the new design pass.
