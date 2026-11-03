# Flashing, motion sensitivity and reduced motion

Compiled 2026-09-29. Flashing content can trigger seizures in people with photosensitive epilepsy, about 3% of people with epilepsy ([Epilepsy Society](https://www.epilepsysociety.org.uk/photosensitive-epilepsy)). Motion can make people with vestibular disorders ill. Both apply to trailers as much as to UI.

## Flash budget

- **WCAG 2.3.1 (Level A).** A general flash is "a pair of opposing changes in relative luminance of 10% or more of the maximum relative luminance (1.0)", counted "where the relative luminance of the darker image is below 0.80". Content passes with "no more than three general flashes and / or no more than three red flashes within any one-second period". A red flash is a transition to or from a state where R/(R + G + B) is 0.8 or more. Flashes smaller than "a total of .006 steradians within any 10 degree visual field" (about 341 x 256 CSS px) are exempt. ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html))
- **WCAG 2.3.2 (AAA)** allows no flashing above 3 per second at any size: "even a single flashing pixel would violate this criterion." ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes.html))
- **Broadcast (ITU-R BT.1702, Ofcom).** A flash counts when the swing is 20 cd/m2 or more while the darker state is below 160 cd/m2, over more than 25% of the screen. More than 3 flashes in 1 s fail unless their leading edges are at least 334 ms apart. Both standards analyse scene changes and inversions as flashes. ([2025 gap analysis, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11872230/)) The same paper notes Japan's rules are stricter: up to three inversions or scene changes per second.
- **Games.** Xbox XAG 118 fails flashing "approximately more than three per second" over "approximately 20 percent or more" of the screen, and prefers removing the content over warning screens ([Microsoft](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118)). The Game Accessibility Guidelines add: avoid flashing sequences longer than 5 seconds, count fast cuts and transitions to or from red as flashes, and never call anything "epilepsy safe" ([GAG](https://gameaccessibilityguidelines.com/avoid-flickering-images-and-repetitive-patterns/)).
- **Most dangerous range.** "Lights that flash or flicker between 16 and 25 times a second are the most likely to trigger seizures." (Epilepsy Society, above)

### What this means for impact craft

- A full-screen white or inverted impact frame is a flash. So is a hard cut between a dark and a bright shot.
- Budget them: at most 3 in any 1 s, or space them at least 334 ms apart. Cutting on eighth notes at 120 BPM gives 4 hits per second, so give the bright frame to every other hit, or keep the flashed area under 20% of the frame.
- Keep flash frames out of saturated red. Ramp a flash's decay over several frames instead of a hard 1-frame strobe (inference: it lowers the luminance swing each frame sees; test it with an analyser).
- Bloom pulses and strobing emissives count if they swing the frame's luminance, not only whole-frame flashes.

## Testing

- A pass on the Harding test does not prove safety. UK tests rest on early-1990s guidance; an O2 advert passed Harding and then failed the stricter Japanese test ([Epilepsy Action](https://www.epilepsy.org.uk/press/photosensitive-epilepsy-and-online-content)). Harding's manual test has a Japanese/NAB 2006 option.
- Free tools (FFmpeg's photosensitivity filter, EA's IRIS, Apple's Video Flashing Reduction) follow no published standard, per a 2025 comparison ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12249941/)). A homemade luminance script is a smoke test, not a certification.
- Do not rely on a warning card. The ASA advises advertisers not to rely on warnings, and flags "flashing lights, rapid cuts between markedly different shots, and contrasting geometric patterns" ([ASA](https://www.asa.org.uk/news/eye-catching-effects-and-epilepsy.html)).

## Reduced motion

Off by default for films and animated pieces: the owner wants full motion. Use this section only when the owner asks for a reduced version. Product UI motion always honours reduced motion; see [ui-components.md](ui-components.md#reduced-motion).

- **Triggers.** Scaling and zooming ("the illusion that the viewer is moving forward or backward"), spinning, multi-speed or multi-directional movement such as parallax, 2D planes moving in 3D space, and "horizontal movement in the peripheral field of vision" (James Craig, [WebKit](https://webkit.org/blog/7551/responsive-design-for-motion/)). Remove only the animations "you *know* to be vestibular triggers"; removing everything can leave an interface "confusing or unusable".
- **Scale is relative to the screen.** Val Head: "Exaggerated parallax and scrolljacking animations are highly likely to be triggering", a full-screen wipe "likely would" be, and animation of "non-moving properties, like opacity, color, and blurs, are unlikely to be problematic" ([A List Apart](https://alistapart.com/article/designing-safer-web-animation-for-motion-sensitivity/)).
- **Replace, don't just remove.** `prefers-reduced-motion` means the user wants motion removed, reduced or replaced. MDN's example swaps a scale pulse for a 4 s opacity dissolve ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).
- **WCAG 2.3.3 (AAA).** Motion triggered by interaction can be disabled; parallax is "often non-essential" ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)).
- **Games.** Xbox XAG 117: avoid camera shake, head bob and motion blur, or give an option to turn them off ([Microsoft](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117)). Halo Infinite has separate 0 to 100% sliders for screen shake, radial blur, full-screen effects and speed lines (same page).

In a `frame(t)` engine, read `matchMedia('(prefers-reduced-motion: reduce)')` once and scale shake, zoom and parallax to 0, turn wipes into dissolves, and keep every caption and state change. The meaning must survive; only the vestibular motion goes.

## Not verified

- No public Steam, Sony or Nintendo rule on flashing was found. Developers report Nintendo testing with a "seizure robot" ([Vice](https://www.vice.com/en/article/its-not-just-cyberpunk-video-games-needs-to-take-epilepsy-more-seriously/)), anonymous and second-hand.
- YouTube and Meta video flashing rules were not found; only Google Ads' image rule against "Strobing, flashing, or otherwise distracting images" ([Google](https://support.google.com/adspolicy/answer/14848199?hl=en)).
- The ITU-R BT.1702 and Ofcom numbers come from the 2025 gap analysis; the primary PDFs did not load.
- Whether an analyser scores a single inverted frame as a flash or a scene change is unsourced. Treat it as a flash.
