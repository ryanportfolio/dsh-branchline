// Walkthrough configuration. The player (player.html) reads window.TOUR before it boots.
// Copy this folder into the project's gitignored scratch folder and edit the values below.
window.TOUR = {
  title: "Product tour",

  // The product's production stylesheet(s), fetched from the live site and saved next to
  // player.html. Add every lazily loaded CSS chunk a chapter's screens need.
  css: [],

  // Classes the product puts on <body> and on its app root, so scenes inherit its base
  // background, text colour and font. Example for a Tailwind/shadcn app:
  // "bg-background text-foreground font-sans".
  bodyClass: "",
  rootClass: "",

  // Stage size in CSS px. Scenes are written in these coordinates; the player scales to fit.
  stage: { w: 1200, h: 720 },

  // How the product switches theme on <html>. Each theme lists the classes and attributes
  // it sets; the player removes the other themes' classes and attributes first. `ink` is
  // the caption text colour for that theme (needed in embed mode, where the page is
  // transparent and the host's background shows behind the caption). `page` is the
  // standalone page colour behind stage and caption, used when the product CSS paints no
  // body background; keep it in contrast with `ink`.
  // Examples: { dark: { class: "dark", ink: "#f1f1f4", page: "#101014" }, light: { ink: "#16161a", page: "#f4f4f6" } }
  //           { dark: {}, "night-light": { attrs: { "data-theme": "night-light" } } }
  themes: { dark: { class: "dark", ink: "#f1f1f4", page: "#101014" }, light: { ink: "#16161a", page: "#f4f4f6" } },
  defaultTheme: "dark",

  // Chapter files in scenes/, in play order (without .js).
  chapters: ["ch1-example"],

  // Guide actor: a script that registers window.WT_ACTORS[id]. null = no actor.
  actor: { src: "actors/cursor.js", id: "cursor", size: 56 },

  // Hold after a chapter's timeline ends before auto-advancing, in ms.
  gapMs: 1800,
  // Largest scale the stage may grow to on big windows.
  maxScale: 1.25,

  // Player chrome accent (progress dots, primary button, tap ripple).
  accent: "#6d5efc",

  // Embed mode only: the host page's origin. "*" accepts and sends to any parent and is
  // for local work only: checks/ship-check.mjs fails on it. Set the real origin
  // (for example "https://app.example.com") before shipping.
  parentOrigin: "*",

  // prefers-reduced-motion: "end-frame" opens each chapter paused on its final frame
  // (Play still works); "ignore" plays as normal. Decide with the owner.
  reducedMotion: "end-frame",

  // Player strings, for localisation. Scene titles, takeaways and on-screen text live in
  // the scene files: one tour per locale, or scenes that read their strings from a table.
  strings: { chapter: "Chapter {n} of {total}", back: "Back", next: "Next", finish: "Finish", skip: "Skip tour", cta: "Try it",
    pause: "Pause", play: "Play", chapters: "Chapters" },
};
