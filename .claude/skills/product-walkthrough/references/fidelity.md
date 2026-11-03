# Fidelity: replicate the real screens

A walkthrough is only worth watching if the screens are the product's. Each chapter rebuilds its screens from the product's own stylesheet and markup, so they look right in every theme without hand-tuned colours, and so a viewer recognises them later in the app.

## The fidelity kit

Build this once per tour, before any scene, in the scratch folder.

1. **Production CSS.** Fetch the stylesheet the live site serves (read the `<link rel="stylesheet">` hrefs from the HTML, `curl` each one) and save it next to `player.html`. List it in `tour.config.js` `css`. The built bundle includes every utility class the app ships; the source Tailwind config does not.
2. **CSS chunks.** Code-split apps load extra stylesheets per route (a settings page, an editor). Open each screen a chapter replicates in a browser, list the CSS requests in the network panel or with Playwright `page.on("response")`, and copy those too.
3. **Fonts.** If the CSS references fonts by relative URL, either copy the font files to the same relative path or rewrite the `@font-face` URLs to absolute production URLs.
4. **Theme switch.** Find how the app sets its theme (a class on `<html>`, a `data-theme` attribute) and mirror it in `tour.config.js` `themes`. Find the base classes on `<body>` and the app root and put them in `bodyClass` and `rootClass`.
5. **Markup.** Open the actual components in the repo and copy their structure: JSX `className` becomes `class`, keep the same utility classes, keep the same nesting. Note the source file and line in a comment at the top of the scene.
6. **Icons.** Inline the product's icon set (for lucide, `checks/build-scene.mjs --lucide ... --icons a,b`). Same icon, same stroke width, same size classes as the component.
7. **Strings.** Where the component reads i18n keys, use the strings from the default-locale translation file, not paraphrases.
8. **Live lists.** Model pickers, template galleries, integration lists: read them from the live product or its public API and copy the names exactly. Record the date.
9. **Assets.** Logos and avatars the real UI shows: inline them as data URIs (`--asset key=path`).

## Class check

Run `node checks/classcheck.mjs --css <product.css> [--css <chunk.css>] scenes` after every scene edit. A class with no rule means one of:

- a CSS chunk was not copied (copy it),
- the class was invented or mistyped (fix it),
- the product itself uses a class its build purged or never defined (keep it as the product has it, and add it to the product bug list).

Pass `--ignore` for hook classes the scene adds for its own `querySelector` calls (use a scene prefix such as `ob6-`).

## Reference captures

Compare the replica against the real product, logged in, in every theme.

- The owner provides a test account in a secret file outside the repo: an empty file they paste into (the `secret-file` skill makes one under `~/.claude/secrets/`, where installed). Line 1 is the user, line 2 the password. Never ask for the password in chat, never print it, never commit it.
- `checks/capture-refs.mjs --config capture-refs.json --out <<screenshots>\project\...> steps/<screen>.mjs` logs in, runs each step module, and deletes the cached session file at the end. Use `--keep-session` only during a capture session and delete the file after.
- Capture each screen in the state the chapter shows: dialog open, list filled, the menu expanded. Put the captures beside the replica's spot shots when reviewing.
- Use a test account, never a customer's. If capturing requires creating data (a project, an upload), use the test account and tell the owner what was created.
- Captures show the test account's name, email and content. Keep them in the screenshot folder, never in the repo or a shipped tour, and delete them with the scratch folder when the work is done.
- `capture-refs.mjs` handles a form login. SSO, OAuth, 2FA, magic links and captchas need captures taken by hand or a saved session the owner provides; do not try to script around them.

## When the source does not map to classes

The kit assumes class-based styling you can fetch. Check before promising fidelity:

- **CSS modules or CSS-in-JS:** class names are hashed or generated at runtime, so source `className`s do not match the served CSS. Copy the rendered DOM and the generated stylesheet from the live page (DevTools or Playwright `page.content()` plus every `<style>` and stylesheet). The class check then only proves the copy is self-consistent.
- **Shadow DOM components:** their styles live inside each shadow root; copy them per component or render the component itself.
- **Themes set in JavaScript** (a theme provider writing CSS variables at runtime): capture the variables for each theme from the live page and put them in a small stylesheet keyed on each theme's class or attribute in `tour.config.js`.
- **Stylesheets behind auth or signed CDN URLs:** fetch them inside the logged-in capture session and save them.

## Honesty rules

- Never invent UI the product lacks: no buttons, panels, badges or flows that are not in the source. If the real flow is clumsy, show it as it is or pick another chapter.
- Compose for the stage, but keep layout relationships true. If the real app replaces the view with a panel, do not show the panel beside the view.
- When a beat needs something that is not UI (a metaphor, a transition between screens), flag it in the storyboard and in the builder's report, keep it short, and keep it visually distinct from product UI.
- Demo data stays plausible and inside the product's limits.
- A behaviour that only works in some cases says so in the caption.

## Product bugs

Replicating a product exposes its bugs: a utility class the build purged, unreadable contrast in one theme, a string with a typo, an internal error message reaching the UI. Do not fix them silently in the replica and do not copy them silently either. Keep one list, `product-bugs.md`, with the file:line, what is wrong, how it shows up, and what the replica did (kept as is, or adjusted and why). Give it to the owner in the handover.
