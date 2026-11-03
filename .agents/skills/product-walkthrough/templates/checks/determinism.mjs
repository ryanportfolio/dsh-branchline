// Scrub determinism: the visible state at time t must be the same whether t is reached
// in order or after jumping to the end and back. Catches state carried between frames,
// CSS transitions on animated elements, and Math.random() in frame(). The default points
// include the first and last frame, so a replay (end, then back to 0) must match the fresh
// start. With more than one chapter, the first frame must also match after each other
// chapter has played to its end, which catches state a scene leaves on the page.
//
// node checks/determinism.mjs --url http://127.0.0.1:4173/player.html [--points 0,0.1,0.3,0.5,0.7,0.9,1] [--themes dark,light] [chapterId ...]
//
// Runs every theme by default. Serialises every rendered element under the stage: tag,
// direct text, key computed styles, SVG geometry and paint attributes, form values,
// scroll offsets and ::before/::after, plus the actor's position. The actor's own
// drawing is left out (it may ease expressions over wall time by contract). Elements
// running a CSS animation are reported, since their state depends on wall time.
// Exit code 1 on any mismatch.
import { parseArgs, need, launch, openPlayer, withQuery } from "./lib/browser.mjs";

const args = parseArgs();
const url = need(args, "url", "player URL");
const points = String(args.points || "0,0.1,0.3,0.5,0.7,0.9,1").split(",").map(Number);
const browser = await launch();
let fails = 0;
try {
  const page = await openPlayer(browser, withQuery(url, "t=0"));
  const themes = args.themes ? String(args.themes).split(",") : await page.evaluate(() => window.__player.themes);
  const list = (await page.evaluate(() => window.__player.scenes())).filter((s) => !args._.length || args._.includes(s.id));
  const snap = (t, pg = page) => pg.evaluate((t) => {
    window.__player.set({ t });
    const SVG_ATTRS = ["transform", "d", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "points", "opacity", "fill", "stroke", "stroke-dashoffset", "stroke-dasharray", "offset", "stop-color"];
    const out = [], anim = [];
    const walk = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none") return;
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("");
      if (cs.animationName !== "none") { anim.push(el.tagName + "." + (el.getAttribute("class") || "")); out.push(el.tagName + "|anim|" + txt); }
      else {
        const parts = [el.tagName, txt, cs.visibility, cs.opacity, cs.transform, cs.backgroundColor, cs.color, cs.top, cs.left, cs.width, cs.height, cs.boxShadow, cs.clipPath];
        if (el instanceof SVGElement) parts.push(SVG_ATTRS.map((a) => el.getAttribute(a) ?? "").join(","));
        if ("value" in el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) parts.push("value=" + el.value);
        if (el.scrollTop || el.scrollLeft) parts.push(`scroll=${el.scrollTop},${el.scrollLeft}`);
        for (const pseudo of ["::before", "::after"]) {
          const ps = getComputedStyle(el, pseudo);
          if (ps.content && ps.content !== "none" && ps.content !== "normal") parts.push(pseudo + "=" + [ps.content, ps.opacity, ps.transform, ps.width].join(","));
        }
        out.push(parts.join("|"));
      }
      for (const c of el.children) walk(c);
    };
    walk(document.getElementById("wt-root"));
    const a = document.getElementById("wt-actor");
    out.push("actor|" + a.style.transform + "|" + a.style.opacity);
    return { out, anim };
  }, t);
  const all = await page.evaluate(() => window.__player.scenes());
  const diff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i; return -1; };
  for (const theme of themes) {
    for (const s of list) {
      await page.evaluate((o) => window.__player.set(o), { theme, scene: s.id, t: 0 });
      const times = [...new Set(points.map((f) => Math.round(s.duration * f)))];
      const fresh = {}, anims = new Set();
      for (const t of times) { const r = await snap(t); fresh[t] = r.out; r.anim.forEach((x) => anims.add(x)); }
      let bad = 0;
      for (const t of [...times].reverse()) {
        await snap(s.duration); await snap(0);
        const again = (await snap(t)).out;
        const i = diff(fresh[t], again);
        if (i >= 0) { bad++; console.log(`${s.id} [${theme}] MISMATCH at t=${t}\n  in order: ${fresh[t][i]}\n  after jump: ${again[i]}`); }
      }
      const others = all.filter((o) => o.id !== s.id);
      if (others.length) {
        // The reference comes from a page of its own: on the shared page an earlier leak
        // would already be in the "fresh" start and both sides would match.
        const own = await openPlayer(browser, withQuery(url, `t=0&scene=${s.id}&theme=${theme}`));
        const start = (await snap(0, own)).out;
        await own.close();
        // Every chapter that can come before this one (Next, Back, the dots), each on a new
        // page, so one chapter cannot reset or hide what another leaked.
        for (const other of others) {
          const pg = await openPlayer(browser, withQuery(url, `t=0&scene=${other.id}&theme=${theme}`));
          for (const f of [...points, 1]) await snap(Math.round(other.duration * f), pg);
          await pg.evaluate((id) => window.__player.set({ scene: id, t: 0 }), s.id);
          const back = (await snap(0, pg)).out;
          await pg.close();
          const i = diff(start, back);
          if (i >= 0) { bad++; console.log(`${s.id} [${theme}] MISMATCH at t=0 after scrubbing ${other.id} to its end\n  fresh: ${start[i]}\n  after ${other.id}: ${back[i]}`); }
        }
      }
      if (bad) fails++;
      console.log(`${s.id} [${theme}]: ${bad ? "FAIL" : "deterministic"}${anims.size ? `; CSS animations (wall-clock, not scrubbable): ${[...anims].slice(0, 5).join(", ")}` : ""}`);
    }
  }
  const errs = await page.evaluate(() => window.__player.errors.slice());
  if (errs.length) { fails++; console.log("player errors:", JSON.stringify(errs)); }
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
