---
name: design-prototypes
description: "Brief → distinct image concepts (sections, features, interactions, branding) → compare → refine pick, before build. Use: /design-prototypes, prototype visual directions, compare design options, refine chosen concept. Built UI → redesign-concepts."
---

# Design prototypes

Help the user choose a visual direction through actual generated images before building it. Default to three clearly different concepts, then refine the selected direction. Honor a requested count or an already selected concept.

## Establish the frame

Use the current conversation, supplied images, and relevant site files or browser view to understand the target section, its purpose, surrounding design, palette, typography, and approved copy. Inspect supplied local images before using them. Ask only when the target or an essential constraint is missing; otherwise state a brief assumption and proceed.

Preserve the site's established identity unless a redesign is requested. Keep exploration scoped to the requested feature or section. Do not invent product capabilities, counts, claims, or marketing copy to fill space.

## Generate alternatives

Use the image-generation capability actually exposed in the current runtime and follow its applicable instructions. In Codex, prefer the built-in image-generation tool. Claude Code has no image tool of its own; there, use the `codex-image-gen` skill, which drives Codex's image tool through `codex exec`. If no image generator is available, explain the gap and offer copy-ready prompts or an available authorized image workflow. Do not claim images were generated or silently substitute code mockups or a paid API.

Choose concepts that differ in composition, visual metaphor, hierarchy, or interaction, rather than three recolors of the same layout. Keep content and viewport comparable so the user can judge the design itself.

Default to a separate image for each section-scale concept; a numbered comparison board works for simple logos or compact illustrations. Make labels readable and selections unambiguous. Use the supplied reference images as actual tool inputs when supported, preserving approved details rather than relying on a verbal description alone.

Prompt for a polished, plausible website design: intentional spacing, concise exact copy, coherent geometry, restrained effects, and enough surrounding context to show how the section fits. Avoid unnecessary device frames and presentation decoration. Respect the user's visual style instead of imposing a fixed aesthetic.

For animation concepts, show key states or a compact storyboard when useful, and describe the intended motion in one sentence. A still image is a visual target, not proof that motion or interaction works.

## Review and present

Inspect every generated result. Correct obvious copy errors, broken geometry, missing requirements, or alternatives that look effectively identical. Keep refinement targeted rather than regenerating endlessly.

Show the images inline with stable numbers and short names. Give each one a sentence explaining its main idea, then recommend one with a concrete reason. Keep commentary brief; the images should carry the decision. Retain accessible image paths and the generation prompts for subsequent refinement.

When the user selects an option, use that exact image as the reference for further edits and preserve its defining shapes, proportions, layout, and approved details. Change only what the user requests. If implementation is later requested, carry forward the selected image and a short note on its defining details and intended motion; validate the built result against the image rather than approximating it from memory.

This workflow produces design images. Do not edit the live site, install dependencies, commit, deploy, or begin implementation unless separately requested. Store preview artifacts outside production assets, using an existing project scratch location when available. Do not bake this session's site, palette, or local paths into future projects.
