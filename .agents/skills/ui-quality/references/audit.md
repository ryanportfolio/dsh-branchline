# Audit mode

Follow this guide in order. An audit request defaults to full depth. A check after a build or a narrow fix uses quick depth. Both run the probe and verify its failures. Full depth also resolves review candidates and performs the applicable manual checks below. A narrow mobile request can limit scope to mobile behavior; say so in the report.

## 1. Define scope and access

Record the main user task, URLs, states and themes requested. Use a short table: `URL | state | how reached | checked / unavailable`. Include relevant loading, empty, error, success, disabled and long-content states; mark those you cannot reach. Read existing design decisions if available, but do not create or change them during an audit-only task.

Use the project's existing server command. A static HTML file can be served with an available static server; keep its assets and relative paths intact. Never assume the port or app stack. On a public site you do not own, load and inspect read-only. Do not submit forms, sign in, change data or run destructive actions there.

The probe reopens each URL in fresh contexts. It does not reproduce menus you opened or input you typed in another browser. States need their own URL, an existing fixture or a saved session. Use an authorized test account for owned apps, and pass an existing Playwright storage-state file with `--storage-state`. Keep that file under private scratch storage, out of reports and commits. Do not pass signed-in sessions for sites you do not own. If a state cannot survive a reload, check it manually and record that the probe did not cover it.

## 2. Run the probe from the repository root

The probe is `scripts/probe.mjs` in the folder that holds the SKILL.md you are applying: `.claude/skills/ui-quality/` in Claude Code, `.agents/skills/ui-quality/` in Codex. The commands below use the Codex path.

Install its packages for this run in scratch storage. This changes neither the project's dependencies nor its lockfile:

```bash
npm i --no-save --prefix .tmp/ui-quality-deps axe-core@latest playwright-core@latest
```

Run it on the real target, into a fresh output folder:

```bash
node .agents/skills/ui-quality/scripts/probe.mjs --url http://localhost:3000/settings --out <output folder>
```

Put the output where the repository's instructions put screenshots, in a new folder for this run. Without such an instruction, leave out `--out` and the probe writes to `.tmp/ui-quality/<time>`. Say in the report where the output went.

Read the exit code straight away.

| Exit | Meaning and next action |
|---|---|
| 0 | The run completed. Read findings and gaps; this is not a clean bill of health. |
| 1 | With `--strict`, at least one candidate has `fail`. Verify the rows. |
| 2 | Incomplete run: the probe could not start, a URL was not audited (an error page such as a 404 or 500 counts), or a check errored. Read the terminal error, each page's `error` and `checks` in report.json. Report partial evidence and the missing checks; repair only the named prerequisite, then retry if possible. |

No Chrome launch allowed or available: do not try headless. Continue with permitted code or manual evidence and mark browser measurements unavailable. Native apps use simulator/device checks, not this web probe; record device and text size.

Useful options, only when needed:

| Option | Use |
|---|---|
| `--url <url>` repeated | Several reachable states; one browser, sequential checks |
| `--wait-for '<css>'` | Wait for content that appears after page load |
| `--settle <ms>` | Change the default 1500 ms settling interval |
| `--storage-state <file>` | Existing authorized Playwright session for an owned app |
| `--max-tabs <n>` | Raise the default 80 if the focus walk was truncated |
| `--skip <check,check>` | Omit inapplicable checks and report each omission |
| `--strict` | Return 1 for candidate failures; it does not replace verification |
| `--allow-error-status` | Audit a page that answers with an HTTP error on purpose, such as a designed 404 page |

Check names: `axe,contrast,focus,reflow,spacing,textscale,motion,shift,dark,phone,page`. Skipping axe also removes the evidence needed by composited contrast and dark contrast. Run probes sequentially on shared hardware. The probe closes its browser; close any verification browser and stop any server you started when finished.

## 3. Read output in this order

1. Open `report.md`. Before reading defect counts, check each URL's line ("NOT AUDITED" and its reason) and its list of checks (ran, skipped, not run, or error), then the notes and "Not measured". A check that did not run measured nothing.
2. Read `report.json` for full selectors, measurements, observations at each width and screenshot paths. The Markdown table is a navigation aid. IDs such as `F001` refer to this run only.
3. Verify every `fail`. At full depth, also decide every `review` and relevant `advisory`. For each row, inspect the element in the recorded state and viewport, read the measurement and threshold, then look up its source below. Open the relevant screenshot; a baseline screenshot does not prove a focused state or a moving effect. Reproduce those when needed.
4. Check every entry in `axeUndecided`, including colour contrast. Pixel sampling covers only eligible desktop text; an undecided row at another width remains unresolved until you check it. Notes about limits mean the remaining elements were not checked.

Use these rule groups in [rules.md](rules.md):

| Output | Rule lookup and verification |
|---|---|
| `axe:*` | Use the row's WCAG number and `help` link. Find the matching rule; preserve an unmatched WCAG source rather than inventing a rule ID. Names/labels: OP1 through OP3, OP11 and OP12; images: SE4; contrast: SE1; targets: RC7. |
| `contrast:*`, `dark:*` | SE1, SE5. Inspect actual text over its background; distinguish median and worst-5% values. |
| `name:*` | OP3 (placeholder as the only label), OP1 and OP12 (a glyph as the only name). axe accepted these; decide whether the name tells a person what the control is or does. |
| `focus:*`, `keyboard:*` | RC1 through RC6; `focus:navigated` is OP13. Confirm focus marker, occlusion and actual keyboard access; a pointer cursor alone does not prove an action. |
| `reflow:*` | RE1, RE5. Check which needed content is lost. Tables/maps/code may scroll inside their own container. |
| `spacing:*`, `textscale:*` | RE2, RE3, RE5. Compare before/after. Width reduction and doubled fonts are probes, not proof of browser zoom behavior. |
| `motion:*` | MO1, MO2. Verify whether motion is essential and whether long-running motion has a pause control. |
| `shift:*` | ST1. Report measured load interval; it is not whole-visit CLS. |
| `phone:*` | RC7; `phone:no-mobile-layout` is RE4, `phone:input-zoom` RE7, `phone:ungated-hover` RC12, `phone:tap-highlight` RC13; fixes in [mobile.md](mobile.md). Under 44 px is AAA/advice; check AA's 24 px size or spacing exceptions separately. |
| `page:*` | IN1 through IN6: `page:failed-request` IN1, `page:error` IN2, `page:broken-image` IN3, `page:font-fallback` IN4, `page:video-stuck` IN5, `page:white-flash` IN6. Open the resource address or the error's location; for a flash, compare the `-early` screenshot (the lightest frame captured while the page loaded) with the `-1280` screenshot. |

For each candidate choose **confirmed**, **dismissed** (state the evidence that disproves it), or **unresolved** (state the missing check). Group repeated manifestations of the same defect, preserving all affected states and widths. Never average measurements across widths or turn a candidate count into a count of confirmed defects.

Common traps when verifying:

- A selector with `>>` points inside a shadow root, and one with `>>>` inside an iframe. Inside a cross-origin iframe only axe ran: check focus markers, names and contrast there by hand. axe also tests each frame's own document, so a row such as `bypass` on `iframe >>> html` is about the frame; decide it for the page as a whole.
- Focus pixel differences can miss a marker drawn on a sibling/label of a hidden native input. Tab manually and inspect the actual control.
- Pixels that change on their own (a spinner, a video, an animated background) are left out of the focus comparison. When they cover more than a tenth of the compared area the row is `focus:unmeasured`, which is not a defect: Tab to the element and look. A marker drawn only over moving content is left out with it and can read as `focus:invisible`.
- `keyboard:not-reached` lists visible focusable elements the Tab walk never reached. Controls that are inert or sit behind an open modal dialog are left out. When the walk cycled back to its first stop, treat it as a focus trap until shown otherwise. Widgets that move `tabindex` as they are used (tabs, toolbars, grids) and controls that only become reachable after an interaction can also appear.
- `focus:navigated` means another address, or another hash route such as `#/billing`, loaded during the Tab walk; a plain in-page anchor does not count; the probe reopened the page for the checks after it. A timer or load-time redirect looks the same: reload, wait without pressing Tab, and see whether the page still navigates.
- `phone:no-mobile-layout` means a phone lays the page out at desktop width and shrinks it. The touch-target sizes on that page are scaled to what the phone shows; axe's target-size rows are not. A page built only for desktop does this on purpose; the row still describes what a phone user gets.
- `phone:ungated-hover` reads only same-origin stylesheets and lists each hover selector whose styles sit outside a hover or fine-pointer media query once, with nested selectors written out (`.a { &:hover {} }` reads `.a:hover`); print-only and disabled sheets are skipped; a note says when cross-origin sheets could not be read. A hover rule that changes only a link colour still sticks after a tap but costs little; one that moves, scales or reveals content matters more. Tailwind v4's `hover:` is already gated.
- `phone:input-zoom` and `phone:tap-highlight` come from Chrome's touch emulation. They show the CSS that causes the behaviour; the zoom and the flash themselves appear only on a real phone.
- The `page:` checks watch one desktop load until the settle time ends, with the page's own Content-Security-Policy in force, as a visitor gets it. Lazy images are switched to load at once so a broken one below the fold is seen. `page:failed-request` lists each request that failed (including a CSP block) or answered HTTP 400 or higher, same-site requests first, except the first answer for the document itself and requests the page or browser cancelled (`net::ERR_ABORTED`); a later navigation of the page, such as a script redirect to an error page, is listed. A signed-out API call answering 401, or a third-party script an ad blocker or firewall stops, also appears; decide whether the page needs the resource. One missing file often shows up twice, as a failed request and as a broken image, stuck video or font fallback.
- `page:error` collects uncaught exceptions and unhandled promise rejections, not `console.error` calls. Its location is the first stack frame, which can sit inside a library rather than the code that called it.
- `page:font-fallback` checks the first visible h1, and in it the first text with letters (emoji, icons and SVG text are skipped); a first family that is generic (`system-ui`, `sans-serif` and the like) is not checked. It reads which font Chrome drew that text with and compares it by name with what the same text draws in a hidden test span. A web font must draw sample text on its own; one that reports `loaded` but draws nothing (`font-display: optional` past its window, or no face covers the text) is flagged, and one that draws the heading's text must be the font the heading used. A Latin web font over Japanese or Chinese text passes, since a later family draws those glyphs by design, and so does a face whose `unicode-range` covers none of the heading text, loaded for other text or not. A named font with no `@font-face` passes when it is installed on the machine running the probe (a localized name such as `游ゴシック` counts), or when a later named font in the stack drew the text, which adds a note instead; so it can still be missing for visitors who lack it. A heading drawn partly in a fallback because one unicode-range subset failed shows only as a failed request.
- `page:video-stuck` reports media errors and videos whose every `<source>` failed or has a type Chrome cannot play (Chrome sets no error for those), for every video. Playback is judged only for videos in the first viewport (and inside the viewport of every iframe around them), because Chrome pauses muted autoplay video out of view: there it reports autoplay left paused (not a video that played to its end), no frame loaded (an autoplay video even with a poster; any other only without a poster), and a video still loading after the settle time. Autoplay without `muted` or `playsinline` is reported even when the video played here. A video with no source at all is treated as a placeholder a script fills in, like an image with no `src`.
- `page:white-flash` captures a frame through DevTools about every 100 ms from navigation to the end of the settle time, including any `--wait-for` wait (Playwright's own screenshot waits for web fonts) and keeps the lightest as the `-early` screenshot. It fires when that frame is at least 50 percentage points more near-white than the settled page and the page's own background is not white: the first CSS gradient or background colour found from the middle of the viewport up to the root (a gradient paints above its element's colour). A white page with a dark image that arrives late is not flagged. A locally served page loads fast, so a flash shorter than about 100 ms is missed; throttle the network or check the deployed site to see the longer one a visitor gets.
- Five occlusion samples suggest coverage; they do not prove every pixel is hidden. Confirm before assigning a WCAG failure.
- Low contrast in the worst 5% may come from a border/icon inside a sampled line box. Check the text itself; filters, blend modes and dynamic backgrounds can need manual measurement.
- Contrast over images accounts for the opacity of the text and of every box around it, including a faded box's own background, and says so in the row. A fade-in still running when the probe measured lowers the ratio; check the settled page.
- An off-canvas drawer or intentional clipping may appear in reflow results. Establish whether visible, needed content is lost. Interior scrolling is different from page-wide scrolling.
- Text stress checks detect clipping, not every overlap. Inspect screenshots for collisions. A consent banner or font swap on first load still affects new visitors.
- A dark media-query check does not operate class/data-attribute theme switches. Test the shipped switch manually; unseen dark styles are a gap.

## 4. Complete manual checks at full depth

Read only the linked rule groups needed for the page. If tools or authorization prevent a check, record it as unavailable. On third-party pages, keep interaction read-only and never infer hidden form behavior from the initial view.

| Check | Action and evidence to retain |
|---|---|
| Names, content and semantics | Inspect visible labels and accessible names together. Placeholder-only labels and ambiguous icon names need human judgment even when axe is quiet. Check heading order, table headers, image alternatives and colour-only signals. Record element and markup or screenshot. SE2 through SE4, OP1 through OP3, OP11 and OP12. |
| Keyboard | Tab and Shift+Tab in logical order; activate controls with Enter/Space; operate arrows where appropriate. Open/close permitted menus and dialogs, check Escape, focus containment and return. Inspect hover content and drag alternatives. Record failing step and element. RC1 through RC11, OP13. |
| Forms and states, owned test app only | Submit empty and invalid values, correct errors, retry and go back. Verify input retained, errors associated, and save/error messages announced. Check disabled reasons, password paste, repeated input and timeout recovery when applicable. Record exact steps and resulting state. OP4 through OP10, OP14 and OP15. |
| Responsive and text | Inspect 320/375 CSS px, supported orientation and actual 200% browser zoom or text resize. Check text overlap under spacing/enlargement. Report which method and sizes you used. RE1 through RE6. |
| Phone behaviour | On a real phone when one is available: tap controls (own press feedback, no grey flash, no hover left behind), focus inputs, open the keyboard, scroll past the top, check the notch and home-indicator zones, swipe carousels and sheets. Emulation and the probe reproduce none of these. Record the device, or that no phone was available. RC10, RC12, RC13, RE7 and [mobile.md](mobile.md). |
| Motion and stability | Check reduced motion, pause controls, hover/press movement and changes after the probe's settling interval. Do not claim a flashing-safety pass from two screenshots. MO1 through MO4, ST1 and ST2. For page integrity, reload the deployed page on a throttled connection to look for a white first paint, and keep the console open through the main task for errors and failed requests the probe did not see (IN1 to IN6). |
| Assistive technology | Use available Narrator, NVDA, VoiceOver or TalkBack. Verify names, order, states and announcements on the main task. DOM/ARIA inspection alone is code evidence, not a screen-reader pass. Record tool and task, or inability to test. |
| Special content and design drift | Inspect relevant canvas, WebGL, media/captions and cross-origin frames separately. Compare implementation against saved design decisions. Record uncovered areas and any conflicting decision. |

## 5. Write the owner report

Save `audit.md` beside `report.md`/`report.json` and link it in the handover. With no probe, choose the same permitted output location and state "Probe not run". Keep raw reports unchanged. Use this structure:

```markdown
# UI audit: <screen>

Result: <confirmed blocker/major/minor counts>. <Main user impact>.
Fix first: <up to five prioritized actions, linked to findings>.

## Coverage
Depth: <quick/full or narrower requested scope>
Target and main task: <URL and task>
States, widths, themes: <actually checked, with method>
Evidence: <raw report links, browser/tool, command and exit code>
Unavailable: <state/check, why, and what would enable it>

## Confirmed findings
### A1. <specific defect> [<Blocker/Major/Minor>]
Where: <URL, state, viewport, selector>
Evidence: <Probe / Measured by hand / Observed / From code>; <probe ID, command, steps, or file and line>
Observed: <actual value/behavior, threshold where applicable, screenshot/code link>
Impact: <who cannot do what, or what becomes harder>
Source: <rule ID, and one source category: WCAG criterion and level, a named platform guideline, Core Web Vitals, or Craft>
Fix: <concrete change>
Verify fix: <repeatable action and expected result>

## Unresolved candidates and limitations
<IDs, missing checks, skipped checks, errors and sampling limits>

## Dismissed candidates
<IDs and the observation that disproved each; group identical causes>
```

Evidence labels: **Probe** only when a row with that ID is in this run's report.json, with the same element and value; **Measured by hand** for a value you measured yourself, naming the command or script and its output; **Observed** for what you saw doing a manual step, with the screenshot; **From code** for what the source shows, with file and line. Never label your own measurement Probe.

Sources: every finding names one category. axe best-practice items are Craft (axe best practice). A defect no rule in rules.md covers still names its category, for example "Craft (no matching rule)" or the WCAG criterion it fails.

Priorities describe user impact: **Blocker** prevents completing the main task for some users; **Major** substantially hinders it or is another confirmed A/AA failure; **Minor** is a lower-impact craft, platform or AAA improvement. Explain impact; do not assign Blocker solely from an axe impact label.

Carry forward the probe's "Not measured", skipped checks, run errors and limit notes. Remove a gap only when you performed that check, and name the method. If nothing is confirmed, say "No confirmed defects in the tested scope" and retain unresolved candidates. Never conclude "accessible" or "WCAG compliant".
