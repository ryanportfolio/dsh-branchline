// Starter chapter. Contract: references/scene-contract.md.
//
// In a real tour every element below is markup copied from the product's source with
// its real classes, rendered by the product's own CSS (tour.config.js `css`). This
// template has no product CSS, so it carries a small scoped stylesheet instead. Replace
// it: delete the <style> block and paste the real component markup.
//
// Beat sheet (ms):
//   0     screen settles; cursor enters from the right
//   900   cursor taps "New project"
//   1200  dialog opens
//   1700  name types into the field
//   3300  cursor taps "Create"
//   3600  dialog closes, the new project card lands at the top of the list
//   4400  card highlight; cursor rests clear of the text
//   6500  end
(function () {
  const T = { newTap: 900, open: 1200, typeStart: 1700, cps: 22, createTap: 3300, close: 3550, land: 3650, glow: 4400, dur: 6500 };
  const NAME = "Q4 launch plan";
  const EXISTING = [
    { name: "Customer interviews", meta: "Edited 2 days ago" },
    { name: "Pricing page refresh", meta: "Edited last week" },
  ];

  const css = `
    .wtx{position:absolute;inset:0;font:15px/1.4 system-ui,sans-serif;--bg:#f7f7f9;--card:#fff;--ink:#16161a;--muted:#6b6b76;--line:#e3e3ea;--acc:#6d5efc}
    html.dark .wtx{--bg:#121216;--card:#1b1b21;--ink:#f1f1f4;--muted:#9a9aa6;--line:#2c2c35}
    .wtx{background:var(--bg);color:var(--ink)}
    .wtx-side{position:absolute;left:0;top:0;bottom:0;width:230px;border-right:1px solid var(--line);padding:22px 18px;box-sizing:border-box}
    .wtx-logo{font-weight:800;font-size:18px;margin-bottom:26px}
    .wtx-nav{color:var(--muted);padding:8px 10px;border-radius:8px;margin-bottom:4px}
    .wtx-nav.on{background:color-mix(in srgb,var(--acc) 14%,transparent);color:var(--ink);font-weight:600}
    .wtx-main{position:absolute;left:230px;right:0;top:0;bottom:0;padding:34px 44px;box-sizing:border-box}
    .wtx-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
    .wtx-h1{font-size:26px;font-weight:800}
    .wtx-btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:10px;padding:10px 16px;font:600 14px system-ui,sans-serif;background:var(--acc);color:#fff}
    .wtx-btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
    .wtx-list{position:relative}
    .wtx-card{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:12px}
    .wtx-ic{width:38px;height:38px;border-radius:10px;background:color-mix(in srgb,var(--acc) 18%,transparent);display:flex;align-items:center;justify-content:center;color:var(--acc)}
    .wtx-meta{color:var(--muted);font-size:13px}
    .wtx-dim{position:absolute;inset:0;background:rgba(0,0,0,.55)}
    .wtx-dlg{position:absolute;left:50%;top:50%;width:440px;margin:-130px 0 0 -220px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;box-sizing:border-box;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)}
    .wtx-label{font-size:13px;color:var(--muted);margin:14px 0 6px}
    .wtx-input{height:42px;border:1px solid var(--line);border-radius:10px;padding:0 12px;display:flex;align-items:center;background:var(--bg)}
    .wtx-caret{display:inline-block;width:2px;height:18px;background:var(--acc);margin-left:1px}
    .wtx-row{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
  `;
  // Inline the product's real icon set the same way (see checks/build-scene.mjs).
  const plus = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
  const folder = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
  const card = (p, cls) => `<div class="wtx-card ${cls || ""}"><span class="wtx-ic">${folder}</span><div><div style="font-weight:700">${p.name}</div><div class="wtx-meta">${p.meta}</div></div></div>`;

  (window.SCENES = window.SCENES || []).push({
    id: "ch1-example", order: 1,
    title: "Start a project in seconds",                         // verb-led: what the viewer can do
    takeaway: "Name it, create it, and it is at the top of your list.", // <= 14 words, true in the product
    cta: { label: "Create a project", href: "/projects/new" },  // the real route, a same-origin path
    // Text alternative for screen readers: what the animation shows, in one or two sentences.
    alt: "The cursor clicks New project, types Q4 launch plan into the name field and clicks Create. The new project appears at the top of the Projects list.",
    duration: T.dur,
    mount(root, ctx) {
      const { OB } = ctx, { prog, lerp, ease } = OB, eo = ease("out"), eio = ease("inOut"), eb = ease("back");
      const stage = OB.h(`<div class="wtx"><style>${css}</style>
        <aside class="wtx-side"><div class="wtx-logo">Acme</div>
          <div class="wtx-nav">Home</div><div class="wtx-nav on">Projects</div><div class="wtx-nav">Settings</div></aside>
        <main class="wtx-main">
          <div class="wtx-head"><div class="wtx-h1">Projects</div><button class="wtx-btn" id="wtx-new">${plus}<span>New project</span></button></div>
          <div class="wtx-list">
            <div id="wtx-fresh" style="overflow:hidden">${card({ name: NAME, meta: "Created just now" })}</div>
            <div id="wtx-rest">${EXISTING.map((p) => card(p)).join("")}</div>
          </div>
        </main>
        <div class="wtx-dim" id="wtx-dim"></div>
        <div class="wtx-dlg" id="wtx-dlg">
          <div style="font-size:18px;font-weight:800">New project</div>
          <div class="wtx-label">Project name</div>
          <div class="wtx-input"><span id="wtx-typed"></span><span class="wtx-caret" id="wtx-caret"></span></div>
          <div class="wtx-row"><button class="wtx-btn ghost">Cancel</button><button class="wtx-btn" id="wtx-create">Create</button></div>
        </div></div>`);
      root.appendChild(stage);
      const $ = (s) => stage.querySelector(s);
      const newBtn = $("#wtx-new"), dim = $("#wtx-dim"), dlg = $("#wtx-dlg"), typed = $("#wtx-typed"), caret = $("#wtx-caret");
      const create = $("#wtx-create"), fresh = $("#wtx-fresh"), rest = $("#wtx-rest"), freshCard = fresh.firstElementChild;
      // Product CSS often animates buttons with `transition`; that lags behind scrubbed values.
      [newBtn, create, dlg, dim, fresh, rest, freshCard].forEach((el) => { el.style.transition = "none"; });

      // Guide path, set once. Targets are stage px of the hit point; aim() turns a target
      // into the actor centre that puts its tip there. Measure targets from a spot
      // screenshot (or log ctx.rect(el) once) and confirm the tap frame with checks/spot.mjs:
      // a guessed point for "Create" landed 50 px below the button on the first try.
      const S = 56;
      const at = (x, y) => ctx.aim(x, y, S);
      const pNew = at(1088, 54), pCreate = at(757, 404);
      ctx.actor([
        { t: 0, x: 1260, y: 420, size: S, expr: "idle", opacity: 1 },
        { t: T.newTap - 80, x: pNew.x, y: pNew.y, expr: "curious", ease: "out" },
        { t: T.newTap, tap: true }, { t: T.newTap + 200, tap: false },
        { t: T.typeStart, x: 1000, y: 470, ease: "inOut" },                   // out of the way while the name types
        { t: T.createTap - 80, x: pCreate.x, y: pCreate.y, ease: "inOut" },
        { t: T.createTap, tap: true }, { t: T.createTap + 200, tap: false },
        { t: T.glow, x: 900, y: 320, expr: "happy", ease: "inOut" },           // rests beside the card, not on its text
        { t: T.dur, x: 905, y: 318 },
      ]);

      const set = OB.writer();
      return {
        frame(t) {
          // Button press: a scale dip driven by t, never a CSS :active state.
          const pn = prog(t, T.newTap, 260);
          set(newBtn, "transform", `scale(${(1 - 0.06 * Math.sin(Math.PI * pn)).toFixed(3)})`);

          // Dialog in at T.open, out at T.close.
          const inP = eo(prog(t, T.open, 280)), outP = eio(prog(t, T.close, 220)), a = inP * (1 - outP);
          set(dim, "opacity", a.toFixed(3)); set(dim, "visibility", a > 0 ? "visible" : "hidden");
          set(dlg, "opacity", a.toFixed(3)); set(dlg, "visibility", a > 0 ? "visible" : "hidden");
          set(dlg, "transform", `scale(${(0.96 + 0.04 * inP - 0.03 * outP).toFixed(4)})`);

          // Typing is a slice of the string by t; the caret blinks off the same clock.
          set(typed, "text", OB.typed(NAME, t, T.typeStart, T.cps));
          set(caret, "opacity", Math.floor(t / 500) % 2 ? "0" : "1");
          const pc = prog(t, T.createTap, 260);
          set(create, "transform", `scale(${(1 - 0.07 * Math.sin(Math.PI * pc)).toFixed(3)})`);

          // New card: the list makes room, then the card lands with a slight overshoot.
          const room = eio(prog(t, T.land - 150, 400)), land = eb(prog(t, T.land, 450));
          set(fresh, "height", `${lerp(0, 86, room).toFixed(1)}px`);
          set(fresh, "opacity", land.toFixed(3));
          set(fresh, "transform", `translateY(${lerp(-14, 0, land).toFixed(1)}px)`);
          const glow = Math.sin(Math.PI * prog(t, T.glow, 1400));
          set(freshCard, "boxShadow", glow > 0 ? `inset 0 0 0 ${(2 * glow).toFixed(2)}px rgba(109,94,252,${(0.6 * glow).toFixed(3)})` : "none");
        },
        destroy() {},
      };
    },
  });
})();
