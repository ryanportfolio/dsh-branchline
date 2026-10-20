#!/usr/bin/env node
// Writes one image prompt per redesign concept from <dir>/concepts.json:
//   <dir>/prompts/NN-name.txt   the prompt, fed to codex exec on stdin
//   <dir>/prompts/NN-name.refs  screenshot paths for that concept, one per line, current screen first
//   <dir>/index.md              numbered list of concepts, problems, ideas, data needs and output paths
// Run from the workspace root; every path it writes into a prompt is relative to that root,
// because codex exec resolves the save path from its own working directory.
//
// The script holds only what is true for every project. Everything about this product comes
// from concepts.json, written from the step 2 critique; no field has a default.
//
// concepts.json:
// {
//   "product": "the Acme orders app",
//   "audience": "shop staff who are not technical",
//   "identity": "warm off-white page, deep green primary buttons, rounded white cards, a serif for headings",
//   "direction": "fewer controls visible at once, plain everyday words, one obvious primary action per area",
//   "orientation": "landscape",                          "landscape" (1536x1024) or "portrait" (1024x1536)
//   "negatives": ["dark mode", "a marketing hero"],      optional, project-specific only
//   "concepts": [
//     { "name": "calm-home", "screen": "home page, first paint",
//       "problem": "twelve filters and four menus compete with the order list",
//       "idea": "one search box and three recent orders; everything else behind 'More'",
//       "refs": ["refs/home.png"], "needs": "recent orders per user" }
//   ]
// }
// "refs" are relative to <dir>. "needs" names data or backend the product lacks today (optional).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node make-prompts.mjs <scratch dir containing concepts.json>");
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(path.join(dir, "concepts.json"), "utf8"));
const sizes = { landscape: "1536x1024", portrait: "1024x1536" };
const missing = ["product", "audience", "identity", "direction", "orientation", "concepts"]
  .filter((key) => !spec[key] || (Array.isArray(spec[key]) && !spec[key].length));
if (missing.length) {
  console.error(`concepts.json: missing ${missing.join(", ")}`);
  process.exit(1);
}
if (!sizes[spec.orientation]) {
  console.error(`concepts.json: orientation must be "landscape" or "portrait", got ${JSON.stringify(spec.orientation)}`);
  process.exit(1);
}

const slash = (p) => p.split(path.sep).join("/");
const sentence = (text) => String(text).trim().replace(/[.\s]*$/, ".");
const negatives = [
  "a copy of the screenshot with small changes",
  "a different visual identity from the screenshots (other colors, type or theme)",
  "device frames or mockups around the screen",
  "placeholder or lorem ipsum text",
  "garbled or misspelled text",
  "more than one screen",
  ...(spec.negatives ?? []),
];

fs.mkdirSync(path.join(dir, "prompts"), { recursive: true });
const index = [`# Redesign concepts: ${spec.product}`, ""];
let failed = false;
let written = 0;

spec.concepts.forEach((concept, i) => {
  const id = `${String(i + 1).padStart(2, "0")}-${concept.name}`;
  const refs = (concept.refs ?? []).map((ref) => slash(path.join(dir, ref)));
  const absent = refs.filter((ref) => !fs.existsSync(ref));
  if (!concept.name || !concept.screen || !concept.problem || !concept.idea || !refs.length || absent.length) {
    console.error(`${id}: needs name, screen, problem, idea and at least one existing ref${absent.length ? ` (missing: ${absent.join(", ")})` : ""}`);
    failed = true;
    return;
  }
  const out = slash(path.join(dir, "out", `${id}.png`));
  const prompt = `Use your image generation tool (image_gen) to create ONE image and save it to ${out} in this workspace. Do nothing else - no code changes. If image_gen is not available, say so and stop; do not draw the image any other way.

The attached image(s) are screenshots of the CURRENT version of ${spec.product}: ${concept.screen}. Design a better version of this same screen for ${spec.audience}.

What is wrong with it now: ${sentence(concept.problem)}

The idea for this version: ${sentence(concept.idea)}

Design direction shared by every version: ${sentence(spec.direction)}

Keep the product's visual identity from the screenshots: ${sentence(spec.identity)} Use the real data you can read in the screenshots (names, titles, numbers). Anything new the idea needs stays short and plausible.

Do NOT produce: ${negatives.join(", ")}.

Requirements: ${spec.orientation} ${sizes[spec.orientation]} PNG, opaque background, save exactly to ${out}
`;
  fs.writeFileSync(path.join(dir, "prompts", `${id}.txt`), prompt);
  fs.writeFileSync(path.join(dir, "prompts", `${id}.refs`), `${refs.join("\n")}\n`);
  written += 1;
  index.push(`${i + 1}. **${concept.name}** (${concept.screen}). Problem: ${sentence(concept.problem)} Idea: ${sentence(concept.idea)}${concept.needs ? ` Needs: ${sentence(concept.needs)}` : ""} Output: \`${out}\``);
});

fs.writeFileSync(path.join(dir, "index.md"), `${index.join("\n")}\n`);
console.log(`Wrote ${written} of ${spec.concepts.length} prompt(s) to ${slash(path.join(dir, "prompts"))} and ${slash(path.join(dir, "index.md"))}`);
if (failed) process.exitCode = 1;
