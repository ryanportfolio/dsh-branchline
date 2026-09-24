/* Headed Chrome launcher that keeps the window out of the operator's way.

   Visual verification runs headed on the real GPU: headless Chromium renders
   WebGL through SwiftShader on the CPU, which is slow and burns the machine the
   session is running on. The cost of headed is that the window lands on top of
   whatever the operator is doing and takes the keyboard with it.

   Placement, via CHROME_PLACE (default 'other-monitor'):
     other-monitor  fill the working area of a display that is not the one holding
                    the foreground window; falls back to 'offscreen' on one display
     offscreen      park the window at -2400,-2400 (rendered, never visible)
     here           plain headed launch, no placement

   Minimizing was measured and rejected: a minimized window loses its compositor
   surface on Windows, so requestAnimationFrame throttles to 1 Hz even with
   --disable-features=CalculateNativeWinOcclusion, and every frame-timing or
   animation reading taken through it is garbage. Screenshots still come back
   fresh at 1 Hz, so a static DOM check will not catch it. Both modes here hold
   full refresh rate (measured 100.5 fps on a 100 Hz panel).

   Placement is Windows-only; elsewhere this is a plain headed launch.
*/
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PS1 = join(dirname(fileURLToPath(import.meta.url)), 'window-place.ps1');
const OFFSCREEN = { x: -2400, y: -2400, width: 1600, height: 1000 };

const BACKGROUNDING_ARGS = [
  // an unfocused window is still doing real work; do not let Chrome idle it down
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];

async function loadChromium() {
  for (const pkg of ['playwright', 'playwright-core']) {
    try {
      return (await import(pkg)).chromium;
    } catch { /* try the next one */ }
  }
  throw new Error('launch-chrome needs playwright or playwright-core installed');
}

function powershell(args) {
  const res = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, ...args],
    { encoding: 'utf8' },
  );
  if (res.status !== 0) throw new Error(res.stderr?.trim() || `window-place.ps1 ${args[0]} failed`);
  return res.stdout.trim();
}

function plan(mode) {
  if (process.platform !== 'win32' || mode === 'here') return null;
  if (mode === 'offscreen') return { ...OFFSCREEN, hwnd: null, target: 'offscreen' };
  try {
    const p = JSON.parse(powershell(['plan']));
    if (p.sameScreen) return { ...OFFSCREEN, hwnd: p.hwnd, target: 'offscreen (single display)' };
    return p;
  } catch (err) {
    console.warn(`[launch-chrome] placement skipped: ${err.message}`);
    return null;
  }
}

/* Launch headed Chrome, placed. Returns what chromium.launch() returns.
   Extra opts: place ('other-monitor' | 'offscreen' | 'here'), args (appended). */
export async function launchPlacedChrome({ place, args = [], ...opts } = {}) {
  const chromium = await loadChromium();
  const mode = place || process.env.CHROME_PLACE || 'other-monitor';
  const spot = plan(mode);

  const launchArgs = [
    ...BACKGROUNDING_ARGS,
    ...(spot ? [`--window-position=${spot.x},${spot.y}`, `--window-size=${spot.width},${spot.height}`] : []),
    ...args,
  ];

  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel: 'chrome', ...opts, args: launchArgs });
  } catch {
    // no system Chrome; bundled Chromium still uses the real GPU. never fall back to headless
    browser = await chromium.launch({ headless: false, ...opts, args: launchArgs });
  }

  if (spot?.hwnd) {
    // Chrome takes the foreground as it maps its window; give it back once it has
    await new Promise((r) => setTimeout(r, 900));
    try {
      powershell(['focus', String(spot.hwnd)]);
    } catch (err) {
      console.warn(`[launch-chrome] focus restore failed: ${err.message}`);
    }
  }
  if (spot) console.log(`[launch-chrome] window on ${spot.target} at ${spot.x},${spot.y}`);
  return browser;
}
