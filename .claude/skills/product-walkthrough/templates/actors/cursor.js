// Default guide actor: a pointer cursor. Contract: references/actor-contract.md.
// The player positions the host so the actor's centre sits on the keyframe x/y;
// tip(size) is the offset from that centre to the point that "clicks".
(function () {
  let uid = 0;
  (window.WT_ACTORS = window.WT_ACTORS || {}).cursor = {
    name: "Cursor",
    box: (size) => ({ w: size, h: size }),
    // The arrow tip sits at (14, 10) in the 100 x 100 viewBox; the centre is (50, 50).
    tip: (size) => ({ x: -0.36 * size, y: -0.40 * size }),
    create(host) {
      const id = "wtcur" + (++uid); // unique per instance: several actors may share a page
      host.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%" style="overflow:visible;display:block">
        <defs><filter id="${id}-sh" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".35"/></filter></defs>
        <g filter="url(#${id}-sh)"><g class="arrow">
          <path d="M14 10 L14 80 L31 64 L43 90 L56 84 L44 58 L68 58 Z" fill="#fff" stroke="#111" stroke-width="5" stroke-linejoin="round"/>
        </g></g></svg>`;
      const arrow = host.querySelector(".arrow");
      let lastP = -1;
      return {
        frame(T, dt, st) {
          // press: 0..1 during a tap. Squash toward the tip so the click reads.
          const p = st.press > 0 && st.press < 1 ? Math.sin(Math.PI * st.press) : 0;
          if (p === lastP) return;
          lastP = p;
          arrow.setAttribute("transform", `translate(14 10) scale(${(1 - 0.14 * p).toFixed(3)}) translate(-14 -10)`);
        },
        destroy() { host.innerHTML = ""; },
      };
    },
  };
})();
