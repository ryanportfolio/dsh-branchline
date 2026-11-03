/* iframe-shield.js: keeps the page scrolling over embedded 3D scenes (Spline, Sketchfab, any canvas iframe).
   See ../references/page-runtime.md.
   A canvas inside an iframe takes the wheel and touch-drag, so the page stops scrolling under the cursor.
   A transparent layer over the iframe takes those events instead, and the page scrolls.

   <iframe data-shield src="...">            plain shield: the scene plays its own animation, no input reaches it
   <iframe data-shield="forward" src="...">  also forwards the pointer to the scene by postMessage, to the
                                             iframe's own origin only, as { shield: 'move'|'down'|'up'|'leave'|'click', x, y }
                                             with x and y from 0 to 1. Only for scenes you control: paste the
                                             receiver from page-runtime.md into the scene.
   Iframes added later: IframeShield.attach(iframe). */
(() => {
  const style = document.createElement('style');
  style.textContent = '.iframe-shield{position:absolute;z-index:1;background:transparent}';
  document.head.appendChild(style);

  const EVENTS = [['pointermove', 'move'], ['pointerdown', 'down'], ['pointerup', 'up'], ['pointerleave', 'leave'], ['click', 'click']];

  function attach(frame) {
    if (frame.__shield) return;
    frame.__shield = true;
    const host = frame.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const shield = document.createElement('div');
    shield.className = 'iframe-shield';
    shield.setAttribute('aria-hidden', 'true');
    frame.after(shield);
    // Cover the iframe's own box, not the whole parent, so sibling links, controls and iframes stay reachable.
    // offsetLeft/Top and absolute positioning both measure from the parent's padding edge.
    const fit = () => {
      Object.assign(shield.style, { left: frame.offsetLeft + 'px', top: frame.offsetTop + 'px', width: frame.offsetWidth + 'px', height: frame.offsetHeight + 'px' });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(frame);
    ro.observe(host);
    if (frame.dataset.shield !== 'forward') return;

    const send = (type, e) => {
      const src = frame.getAttribute('src');          // empty until a lazy loader sets it
      if (!src || !frame.contentWindow) return;
      let origin;
      try { origin = new URL(src, location.href).origin; } catch { return; }
      if (origin === 'null') return;                  // file:// or sandboxed: no origin to address safely
      const r = frame.getBoundingClientRect();
      frame.contentWindow.postMessage({ shield: type, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }, origin);
    };
    for (const [event, type] of EVENTS) shield.addEventListener(event, e => send(type, e), { passive: true });
  }

  const scan = () => document.querySelectorAll('iframe[data-shield]').forEach(attach);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  window.IframeShield = { attach };
})();
