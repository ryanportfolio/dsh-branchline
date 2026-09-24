# lab templates

Two copy-paste starting points. Both are single self-contained files (inline JS+CSS, no imports, no build). Adapt the knob list to the element you're tuning — the structure (live-bound controls, seeded defaults, Copy Settings → JSON keyed by real constant names) stays the same.

Shared rules:
- Seed every control `value` at the element's CURRENT real value (opens at parity).
- Each control's `id` / JSON key = the real constant name (1:1 port map).
- The `<pre>` mirror is the PRIMARY channel: it shows the JSON live (updates on every input) so the user can read/screenshot/paste it. `Copy Settings` is a best-effort OS-clipboard copy on top — it must never be the only way out, because `navigator.clipboard` is commonly `undefined` on `file://` (see SKILL.md step 3).

---

## A. Canvas / game-feel lab

Procedurally mocks the effect (here: a particle burst on a throttle). Replace the `KNOBS` list and the `render()`/`burst()` bodies with your element. Do NOT import the real engine — reproduce the look.

```html
<!doctype html><html><head><meta charset="utf-8"><title>fx lab</title>
<style>
  body{margin:0;background:#0a0e14;color:#cfe;font:13px ui-monospace,monospace;display:flex}
  #stage{flex:1;display:block}
  #panel{width:300px;padding:14px;background:#11161f;overflow:auto;height:100vh;box-sizing:border-box}
  .row{margin:10px 0}.row label{display:flex;justify-content:space-between;gap:8px}
  input[type=range]{width:100%}
  button{width:100%;padding:8px;margin-top:8px;background:#36e0ff;border:0;border-radius:6px;font-weight:700;cursor:pointer}
  pre{white-space:pre-wrap;background:#0a0e14;padding:8px;border-radius:6px;font-size:11px}
</style></head><body>
<canvas id="stage"></canvas>
<div id="panel"><h3>fx lab</h3><div id="controls"></div>
  <button id="copy">Copy Settings</button><pre id="out"></pre></div>
<script>
// EDIT: one entry per tunable. key = real constant name. [min,max,step].
const KNOBS = [
  { key:"SHARDS",        val:6,    min:0,  max:24,  step:1 },
  { key:"SPREAD_SPEED",  val:230,  min:20, max:600, step:10 },
  { key:"LIFETIME_MS",   val:360,  min:60, max:1500,step:20 },
  { key:"SHARD_SIZE",    val:3,    min:1,  max:12,  step:0.5 },
  { key:"FIRE_HZ",       val:2.5,  min:0.2,max:8,   step:0.1 },
  { key:"COLOR",         val:"#ffd9b0", color:true },
];
const S = Object.fromEntries(KNOBS.map(k=>[k.key,k.val]));
const controls=document.getElementById("controls");
for(const k of KNOBS){
  const row=document.createElement("div");row.className="row";
  if(k.color){
    row.innerHTML=`<label>${k.key}<input type=color value="${k.val}"></label>`;
    row.querySelector("input").oninput=e=>S[k.key]=e.target.value;
  }else{
    row.innerHTML=`<label>${k.key} <span>${k.val}</span></label><input type=range min=${k.min} max=${k.max} step=${k.step} value=${k.val}>`;
    const span=row.querySelector("span"),inp=row.querySelector("input");
    inp.oninput=e=>{S[k.key]=parseFloat(e.target.value);span.textContent=e.target.value;};
  }
  controls.appendChild(row);
}
// Copy Settings — built to survive file:// (where navigator.clipboard is often UNDEFINED and
// writeText() throws synchronously). See SKILL.md step 3. The live <pre id=out> mirror is the
// real channel back; the OS-clipboard copy is best-effort on top.
const out=document.getElementById("out");
const buildJson=()=>JSON.stringify(S,null,2);
const renderOut=()=>{out.textContent=buildJson();};
renderOut(); // seed so the box is never empty
// Live mirror: ranges/colors fire "input"; toggle buttons fire "click". Catch both so the JSON
// always reflects the current state without a click.
document.getElementById("panel").addEventListener("input",renderOut);
document.getElementById("panel").addEventListener("click",e=>{if(e.target.tagName==="BUTTON"&&e.target.id!=="copy")renderOut();});
const selectOut=()=>{const r=document.createRange();r.selectNodeContents(out);const s=getSelection();s.removeAllRanges();s.addRange(r);};
document.getElementById("copy").onclick=()=>{
  out.textContent=buildJson();selectOut(); // write + select FIRST so a manual Ctrl+C always works
  let ok=false;
  try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(out.textContent).catch(()=>{});ok=true;}}catch(_){}
  if(!ok){try{ok=document.execCommand("copy");}catch(_){}}
};

const cv=document.getElementById("stage"),ctx=cv.getContext("2d");
function resize(){cv.width=innerWidth-300;cv.height=innerHeight;}resize();onresize=resize;
let parts=[],acc=0,last=performance.now();
function burst(x,y){ // EDIT: spawn logic from your knobs
  for(let i=0;i<S.SHARDS;i++){const a=Math.random()*Math.PI*2,sp=S.SPREAD_SPEED*(0.5+Math.random()*0.5);
    parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,age:0,life:S.LIFETIME_MS/1000});}
}
function frame(now){const dt=(now-last)/1000;last=now;
  acc+=dt; if(acc>=1/S.FIRE_HZ){acc=0;burst(cv.width/2,cv.height/2);} // EDIT: emitter
  ctx.fillStyle="#0a0e14";ctx.fillRect(0,0,cv.width,cv.height);
  parts=parts.filter(p=>p.age<p.life);
  for(const p of parts){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
    ctx.globalAlpha=1-p.age/p.life;ctx.fillStyle=S.COLOR; // EDIT: draw
    ctx.beginPath();ctx.arc(p.x,p.y,S.SHARD_SIZE,0,7);ctx.fill();}
  ctx.globalAlpha=1;requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script></body></html>
```

---

## B. Web / DOM lab

Live-tunes a component via CSS custom properties. Each slider writes a `--var`; the preview reads it. Replace the preview markup and the `KNOBS` with your element. Good for spacing scales, radius, type, color, shadow, motion.

```html
<!doctype html><html><head><meta charset="utf-8"><title>ui lab</title>
<style>
  body{margin:0;font:14px system-ui;display:flex;background:#f4f5f7;color:#111}
  #stage{flex:1;display:grid;place-items:center;min-height:100vh}
  #panel{width:300px;padding:16px;background:#fff;border-left:1px solid #e4e4e7;height:100vh;overflow:auto;box-sizing:border-box}
  .row{margin:12px 0}.row label{display:flex;justify-content:space-between;gap:8px;font-size:12px}
  input[type=range]{width:100%}
  button{width:100%;padding:9px;margin-top:10px;background:#111;color:#fff;border:0;border-radius:8px;font-weight:600;cursor:pointer}
  pre{white-space:pre-wrap;background:#f4f5f7;padding:8px;border-radius:6px;font-size:11px}
  /* EDIT: preview component reads the live vars */
  .card{background:#fff;border-radius:var(--radius);padding:var(--pad);box-shadow:0 var(--shadowY) var(--shadowBlur) rgba(0,0,0,var(--shadowA));max-width:360px}
  .card h2{margin:0 0 var(--gap);font-size:var(--titleSize);color:var(--accent)}
  .card p{margin:0;color:#52525b;line-height:1.5}
</style></head><body>
<div id="stage"><div class="card"><h2>Preview component</h2><p>Tune the knobs on the right. This card reads them live via CSS variables.</p></div></div>
<div id="panel"><h3>ui lab</h3><div id="controls"></div>
  <button id="copy">Copy Settings</button><pre id="out"></pre></div>
<script>
// EDIT: key = real token/const name, cssVar = the --var it drives, unit appended on apply.
const KNOBS = [
  { key:"radius",     cssVar:"--radius",     val:12, min:0, max:40, step:1, unit:"px" },
  { key:"pad",        cssVar:"--pad",        val:24, min:8, max:64, step:1, unit:"px" },
  { key:"gap",        cssVar:"--gap",        val:8,  min:0, max:32, step:1, unit:"px" },
  { key:"titleSize",  cssVar:"--titleSize",  val:20, min:12,max:40, step:1, unit:"px" },
  { key:"shadowY",    cssVar:"--shadowY",    val:4,  min:0, max:40, step:1, unit:"px" },
  { key:"shadowBlur", cssVar:"--shadowBlur", val:12, min:0, max:80, step:1, unit:"px" },
  { key:"shadowA",    cssVar:"--shadowA",    val:0.1,min:0, max:0.5,step:0.01,unit:"" },
  { key:"accent",     cssVar:"--accent",     val:"#4f46e5", color:true },
];
const root=document.documentElement,S={};
const controls=document.getElementById("controls");
function apply(k){root.style.setProperty(k.cssVar, k.color? S[k.key] : S[k.key]+(k.unit||""));}
for(const k of KNOBS){
  S[k.key]=k.val;const row=document.createElement("div");row.className="row";
  if(k.color){
    row.innerHTML=`<label>${k.key}<input type=color value="${k.val}"></label>`;
    row.querySelector("input").oninput=e=>{S[k.key]=e.target.value;apply(k);};
  }else{
    row.innerHTML=`<label>${k.key} <span>${k.val}</span></label><input type=range min=${k.min} max=${k.max} step=${k.step} value=${k.val}>`;
    const span=row.querySelector("span"),inp=row.querySelector("input");
    inp.oninput=e=>{S[k.key]=parseFloat(e.target.value);span.textContent=e.target.value;apply(k);};
  }
  controls.appendChild(row);apply(k);
}
// Copy Settings — built to survive file:// (where navigator.clipboard is often UNDEFINED and
// writeText() throws synchronously). See SKILL.md step 3. The live <pre id=out> mirror is the
// real channel back; the OS-clipboard copy is best-effort on top.
const out=document.getElementById("out");
const buildJson=()=>JSON.stringify(S,null,2);
const renderOut=()=>{out.textContent=buildJson();};
renderOut(); // seed so the box is never empty
// Live mirror: ranges/colors fire "input"; toggle buttons fire "click". Catch both so the JSON
// always reflects the current state without a click.
document.getElementById("panel").addEventListener("input",renderOut);
document.getElementById("panel").addEventListener("click",e=>{if(e.target.tagName==="BUTTON"&&e.target.id!=="copy")renderOut();});
const selectOut=()=>{const r=document.createRange();r.selectNodeContents(out);const s=getSelection();s.removeAllRanges();s.addRange(r);};
document.getElementById("copy").onclick=()=>{
  out.textContent=buildJson();selectOut(); // write + select FIRST so a manual Ctrl+C always works
  let ok=false;
  try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(out.textContent).catch(()=>{});ok=true;}}catch(_){}
  if(!ok){try{ok=document.execCommand("copy");}catch(_){}}
};
</script></body></html>
```
