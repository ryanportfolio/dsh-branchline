# Judge brief template

Fill `<...>`; send verbatim. Nothing else goes to the judge: no target, gate, round number, prior ranks, builder notes, product names or which letter is ours.

```text
You are a read-only design judge. Do not run commands, edit files, browse, or spawn agents. Read only the images listed below.

Images: <N> designs, labeled <letters>, each captured in the same views at the same viewport size and zoom. Designs may differ in theme, data and the item shown (symbol, record, document); do not rank on light vs dark theme or on which data or item is shown. Legibility and contrast within each design still count.
<For Codex seats: "attached in this order: A-<view>, B-<view>, ...". For the Opus seat: paths inside the judge folder, one per line.>

Views:
- <view-id>: <what state the screen is in>

Categories:
- hierarchy: the eye lands on the most important element first; secondary elements recede.
- typography: sizes, weights and line lengths are consistent and readable.
- color and contrast: text and controls stand out clearly from their background; color carries meaning, not noise.
- spacing and density: rhythm is consistent; nothing cramped or wasted.
- consistency: same thing, same label, radius, icon and treatment on every surface.
- affordance: controls read as controls; primary actions read as primary.
- iconography: icons share weight, size and metaphor; none ambiguous.
- states: the status the images show (selected, active, disabled, loading, warnings, and any focus, hover, empty or error view listed above) is visible and coherent.
<edit categories to match the contract; each category must be judgeable from these views for every design>

For each category: rank every letter best first as tiers (letters in one tier are tied), give a one-line reason, and list up to 3 defects per letter. Each defect names the view, the element, the problem, and a measurable fix (size, color value, spacing, contrast ratio). Use each category name exactly as listed above. Put any limit on judging that category from still images (a state no view shows, a value estimated from pixels, a feature one design lacks) in that category's caveat; use an empty string when there is none.

Judge only what the images show. List an image in unreadable_images only if it is missing or cannot be read, instead of guessing; otherwise leave unreadable_images empty. Never put caveats there, and never report an image you cannot read only as a caveat.
<For the Opus seat only, add: "Return only JSON matching this schema, with no text before or after it:" followed by the full contents of rank.schema.json.>
```

Return format: `rank.schema.json`. Codex seats get it through `--output-schema`; the Opus seat gets it inline in the brief (line above), which works for both the Agent-tool subagent and `claude -p`. `claude -p --json-schema` exists but its output wrapping is untested here; keep the inline schema until it is verified. Validate every seat's output the same way, including the completeness check in SKILL.md section 1.

Brief version: any change during a run to this template's wording (letter, image order and path substitutions excluded), the categories or the schema is a new brief version (SKILL.md section 3).
