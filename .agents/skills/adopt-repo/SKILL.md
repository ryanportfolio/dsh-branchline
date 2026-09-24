---
name: "adopt-repo"
description: "Mirror an existing external repo privately under the user's account and overlay the firmware: clone upstream, strip template-only files, privacy-sweep, run init-project. Use on $adopt-repo <url> or 'pull this repo into our firmware'."
---

# Overlay the firmware onto an existing repo

The generator (`bootstrap/new-claude-project.*`) spawns empty projects. This skill is the other entry point: a repo that already exists elsewhere (a take-home exercise, a client codebase, a fork target) becomes a harness-equipped copy under the user's account, with upstream history preserved as the root.

This workflow is classified Dangerous. Invocation alone does not authorize creating the remote repository or pushing. Publish only when the user explicitly asked for the mirror under their account, and only to the confirmed target and visibility; otherwise stop after local verification and report the ready state.

## Inputs

Ask directly only for what the invocation left out: upstream URL, target repo name (default: upstream's name), visibility (default: private). Check the target name before creating anything. A failed `gh repo view` is not proof of availability: distinguish a confirmed not-found result from authentication, permission, or network failure. Verify the local destination is absent or empty; never overlay an unrelated checkout.

## Steps

1. **Clone upstream** to a short path, not a session scratch or other deep temp directory. Windows checkouts lose files past 260 chars when `core.longpaths` is off, and the loss is silent if clone output is piped. After cloning, compare `git ls-files | wc -l` against the upstream tree count.
2. **Prepare the mirror locally.** Record the exact upstream commit and file inventory, retain an `upstream` remote, and confirm target account, name, and visibility. Inspect upstream history for private material or secrets before any push; preserving history means a clean working tree alone cannot establish safe publication. A real finding blocks publication pending a user decision about history handling.
3. **Overlay the firmware.** Shallow-clone the template (also to a short path). Read `TEMPLATE_ONLY_PATHS` from `bootstrap/new-claude-project.sh` in that clone and strip those paths plus the template `README.md` and any `.tmp*` directories; do not keep a private copy of the list, the script is the source of truth. Copy the rest over with these collision rules: the adopted repo's own files always win (`README.md`, manifests, configs); `.gitignore` is merged by appending the template's entries under a `# Harness` comment; report any other collision instead of resolving it silently.
4. **Privacy sweep before committing or publishing.** The overlay may travel to reviewers or clients. Search it for email addresses, personal names, client or project identifiers, and key/secret/token patterns; exclude generic prose hits. Anything real stays out and gets reported.
5. **Commit the overlay locally** as its own commit (subject notes the template and that template-only files were stripped). Honor the adopted repo's commit convention. Do not publish until collision resolution, privacy checks, configuration, and preservation checks below complete.
6. **Run `$init-project`.** It fills the FILL IN sections from the detected stack, seeds `.claude/reference/`, applies the skill profile, syncs Codex skills, and wires the `starter` remote. Its own authorization limits still apply.
7. **Verify and publish within authorization.** Check configuration placeholders and compare against the recorded upstream commit. Original files remain byte-identical except the intentional `.gitignore` union and any explicitly approved collision resolution. Inspect those exceptions separately: retain all upstream ignore rules and record additions. Check the actual added-file inventory rather than assuming counts add across collisions. After all checks pass, and only if publication is authorized, create the target repo with the confirmed visibility, set `origin`, and push the preserved history plus overlay/configuration commits. Verify remote identity and visibility.

## Hard rules

- Never force-push; never rewrite the upstream history that forms the base.
- Never modify upstream-pinned dependencies or build config during adoption; adoption adds the harness, nothing else.
- Fork only when the user explicitly wants the public upstream link and accepts that a fork of a public repo cannot be private; otherwise this clone-and-push flow is the default.
