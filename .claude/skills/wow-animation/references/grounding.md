# Grounding recon

Recon agents gather facts; they do not design. All subject research runs on Sonnet (`model: "sonnet"`), dispatched in parallel in one message, one agent per source slice below so no two read the same material. A large subject can take six or more agents; split further rather than give one agent two slices. Each agent returns its rows for `facts.md` plus a short list of hook candidates. The orchestrator merges the rows; a director (`model` omitted) later judges what matters (which bosses are the hook, which feature is the real reason to use the product).

Default slices: live site or store page; repo copy and product strings; design tokens, fonts and logo; feature or system code; sprites and art (games); enemy and boss code (games); screens and flow of the core task (products).

## Output: `facts.md`

One row per usable fact. Directors and critics use nothing outside it. Rows below show the format only.

| Fact | Exact text or value | Source | Kind |
|---|---|---|---|
| Tagline | "..." | `src/pages/home.tsx:42` | copy |
| Boss HP phases | 3 at 66% and 33% | `game/bosses/warden.ts:118` | number |
| Brand accent | `#7C5CFF` | `tailwind.config.ts:12` | token |

Kinds: copy, number, feature, token (color, font, radius), asset (path to a sprite, logo, icon, screenshot), behavior (what a system or enemy does, with the code path). Public page and code disagree → record both and flag it; the code wins for claims about behavior.

## Website or web app

- Live site: fetch every public page; capture hero, key flows and the logo in headed offscreen Chrome.
- Repo: product copy strings, design tokens, fonts, logo SVG, icon set, the components behind the core task.
- Features: confirm each claimed feature exists in code (route, handler, UI). Marketing claims with no code path get flagged.
- Real data shapes for any UI shown on screen (field names, realistic values from fixtures or seed data, never private user data).

## Game

- Store page (Steam or other): short and long description, tags, screenshots, trailer, capsule art, price and release state.
- Sprites and art: paths, sizes, palettes, animation frame counts for the player, enemies, bosses, pickups, UI.
- Enemy and boss code: names, attack patterns, telegraph timings, phases, HP, weak points. These drive the stylized "uber" versions and must stay true to how the fight reads.
- Systems: the core loop, upgrades, economy, synergies, difficulty tiers. For each, the risk, the reward and the power spike a stranger should see.
- Feel: screen shake, hitstop, particle and sound hooks already in the game, to echo in the trailer.
- Hook candidates: the biggest boss, the most surprising system, the best-looking moment.

## App or feature

- Screens and flow of one real task, start to finish, with the real UI strings.
- Release notes, changelog or PR that introduced the feature: what changed and why.
- Before and after, if the feature replaces a manual step.

## No repo access

Public sources only. Mark every row `unverified`, tell the user, and ask for a repo path before the build step.
