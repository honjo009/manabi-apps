const STEPS = {
  1:"ばね単体", 2:"浮力単体", 3:"重さ−浮力", 4:"一部沈める",
  5:"のびから逆算", 6:"液体を変える", 7:"直列・並列", 8:"台ばかり"
};

/* ---------- figure renderer ---------- */
const K = 4; // px per cm
function springPath(x, y, len){
  const e = 6, n = 10, w = 9, seg = (len - 2*e) / n;
  let d = `M${x} ${y} L${x} ${y+e}`;
  for (let i=0;i<n;i++) d += ` L${x + (i%2 ? -w : w)} ${(y + e + seg*(i+0.5)).toFixed(1)}`;
  return d + ` L${x} ${y+len-e} L${x} ${y+len}`;
}
function arrow(x1,y1,x2,y2,cls){ return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="s-${cls}" marker-end="url(#m-${cls})"/>`; }
const DEFS = `<defs>${["up","dn","sp"].map(c=>`<marker id="m-${c}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="m-${c}"/></marker>`).join("")}</defs>`;

function hang(s){
  const cx = 100; let g = ""; let cur = 14; const top = 14;
  const mode = s.mode || "single";
  if (mode !== "free") g += `<rect x="${cx-50}" y="4" width="100" height="10" class="s-ceil"/>`;
  let springEnd = null;
  if (mode === "single"){ const L=s.L[0]*K; g += `<path d="${springPath(cx,cur,L)}" class="s-spr"/>`; cur+=L; springEnd=cur; }
  if (mode === "series"){
    const L1=s.L[0]*K, L2=s.L[1]*K;
    g += `<path d="${springPath(cx,cur,L1)}" class="s-spr"/>`; cur+=L1;
    g += `<circle cx="${cx}" cy="${cur+3}" r="3" class="s-ln"/>`; cur+=6;
    g += `<path d="${springPath(cx,cur,L2)}" class="s-spr"/>`; cur+=L2; springEnd=cur;
  }
  if (mode === "parallel" || mode === "combo"){
    const L=s.L[0]*K;
    g += `<path d="${springPath(cx-22,cur,L)}" class="s-spr"/><path d="${springPath(cx+22,cur,L)}" class="s-spr"/>`;
    cur+=L; g += `<rect x="${cx-34}" y="${cur}" width="68" height="5" class="s-ceil"/>`; cur+=5; springEnd=cur;
    if (mode==="combo"){ const L2=s.L[1]*K; g += `<path d="${springPath(cx,cur,L2)}" class="s-spr"/>`; cur+=L2; springEnd=cur; }
  }
  if (mode === "meter"){
    g += `<line x1="${cx}" y1="${cur}" x2="${cx}" y2="${cur+10}" class="s-ln"/>`; cur+=10;
    g += `<rect x="${cx-13}" y="${cur}" width="26" height="62" rx="5" class="s-meter"/>`;
    for(let i=0;i<5;i++) g += `<line x1="${cx-6}" y1="${cur+12+i*10}" x2="${cx+6}" y2="${cur+12+i*10}" class="s-dim"/>`;
    g += `<text x="${cx+20}" y="${cur+36}" class="${s.read==="?g"||/\?/.test(s.read||"")?"s-q":"s-tm"}">${s.read||""}</text>`;
    cur+=62;
    g += `<line x1="${cx}" y1="${cur}" x2="${cx}" y2="${cur+34}" class="s-ln"/>`; cur+=34;
  }
  if (mode === "rod"){ g += `<line x1="${cx}" y1="14" x2="${cx}" y2="${cur+50}" class="s-ln" stroke-width="4"/><text x="${cx+8}" y="${cur+20}" class="s-t">棒でおさえる</text>`; cur+=50; }
  if (mode !== "free" && mode !== "rod" && mode !== "meter"){ g += `<line x1="${cx}" y1="${cur}" x2="${cx}" y2="${cur+10}" class="s-ln"/>`; cur+=10; }
  if (mode === "free") cur = 40;
  const bw=50, bh=42, yb=cur;
  // length annotation
  if (s.lab && springEnd){
    const x=cx+46;
    g += `<path d="M${x-5} ${top} H${x} V${springEnd} H${x-5}" class="s-dim"/>`;
    g += `<text x="${x+5}" y="${(top+springEnd)/2+5}" class="${s.lab.includes("?")?"s-q":"s-tm"}">${s.lab}</text>`;
  }
  // liquid
  let bottomY = yb + bh + 10;
  if (s.sub != null){
    let yw = s.sub >= 1 ? yb - 14 - (s.deep||0) : yb + (1 - s.sub) * bh;
    let by = s.touch ? yb + bh : Math.max(yw + 92, yb + bh + 14);
    g += `<rect x="${cx-68}" y="${yw}" width="136" height="${by-yw}" class="s-wat"/>`;
    g += `<line x1="${cx-68}" y1="${yw}" x2="${cx+68}" y2="${yw}" class="s-surf"/>`;
    g += `<path d="M${cx-68} ${yw-20} V${by} H${cx+68} V${yw-20}" class="s-bkr"/>`;
    if (s.liq) g += `<text x="${cx-63}" y="${by-8}" class="s-t">${s.liq}</text>`;
    bottomY = by;
    if (s.scale){
      g += `<rect x="${cx-60}" y="${by+2}" width="120" height="6" class="s-ceil"/>`;
      g += `<rect x="${cx-48}" y="${by+8}" width="96" height="32" rx="4" class="s-scale"/>`;
      g += `<text x="${cx}" y="${by+29}" text-anchor="middle" class="${s.scale.includes("?")?"s-q":"s-tm"}">${s.scale}</text>`;
      bottomY = by + 40;
    }
  }
  // block
  g += `<rect x="${cx-bw/2}" y="${yb}" width="${bw}" height="${bh}" rx="3" class="s-blk"/>`;
  const lines = (s.obj||"").split("\n");
  lines.forEach((t,i)=> g += `<text x="${cx}" y="${yb + 18 + i*14 - (lines.length-1)*6}" class="s-blkt">${t}</text>`);
  // arrows
  (s.arrows||[]).forEach(a=>{
    if (a.k==="buoy"){ g += arrow(cx+14, yb+bh+30, cx+14, yb+bh-2, "up"); g += `<text x="${cx+22}" y="${yb+bh+28}" class="${a.t.includes("?")?"s-q":"s-tm"}">${a.t}</text>`; }
    if (a.k==="weight"){ g += arrow(cx-14, yb+bh/2, cx-14, yb+bh+32, "dn"); g += `<text x="${cx-22}" y="${yb+bh+30}" text-anchor="end" class="s-tm">${a.t}</text>`; }
  });
  if (s.cap) { g += `<text x="${cx}" y="${Math.max(bottomY, yb+bh) + 22}" class="s-cap">${s.cap}</text>`; bottomY = Math.max(bottomY, yb+bh) + 26; }
  const H = Math.max(bottomY, yb + bh + ((s.arrows||[]).length ? 40 : 0)) + 8;
  return { g, w: 230, h: H };
}
function svgWrap(inner, w, h){ return `<svg viewBox="0 0 ${w} ${h}" width="${w*1.5}" height="${h*1.5}" role="img" aria-label="問題の図">${DEFS}${inner}</svg>`; }
function forces(f){
  const cx=150, yb=110, bh=50;
  let g = `<rect x="20" y="70" width="260" height="150" class="s-wat"/><line x1="20" y1="70" x2="280" y2="70" class="s-surf"/>`;
  g += `<rect x="${cx-50}" y="4" width="100" height="10" class="s-ceil"/><path d="${springPath(cx,14,70)}" class="s-spr"/><line x1="${cx}" y1="84" x2="${cx}" y2="${yb}" class="s-ln"/>`;
  g += `<rect x="${cx-30}" y="${yb}" width="60" height="${bh}" rx="3" class="s-blk"/>`;
  g += arrow(cx-12, yb+4, cx-12, yb-40, "sp") + `<text x="${cx-20}" y="${yb-24}" text-anchor="end" class="s-tm">${f.spring}</text>`;
  g += arrow(cx+12, yb+bh+40, cx+12, yb+bh+2, "up") + `<text x="${cx+20}" y="${yb+bh+34}" class="s-tm">${f.buoy}</text>`;
  g += arrow(cx-12, yb+bh-4, cx-12, yb+bh+46, "dn") + `<text x="${cx-20}" y="${yb+bh+40}" text-anchor="end" class="s-tm">${f.weight}</text>`;
  g += `<text x="28" y="212" class="s-t">水</text>`;
  return svgWrap(g, 300, 230);
}
function knowFig(){
  let g = `<rect x="150" y="4" width="100" height="10" class="s-ceil"/><line x1="200" y1="14" x2="200" y2="24" class="s-ln"/>`;
  g += `<rect x="187" y="24" width="26" height="50" rx="5" class="s-meter"/>`;
  for (let i=0;i<4;i++) g += `<line x1="194" y1="${34+i*10}" x2="206" y2="${34+i*10}" class="s-dim"/>`;
  g += `<text x="220" y="52" class="s-tm">60g</text>`;
  g += `<line x1="200" y1="74" x2="200" y2="110" class="s-ln"/>`;
  g += `<rect x="110" y="90" width="180" height="112" class="s-wat"/><line x1="110" y1="90" x2="290" y2="90" class="s-surf"/>`;
  g += `<path d="M110 70 V202 H290 V70" class="s-bkr"/>`;
  g += `<rect x="175" y="110" width="50" height="40" rx="3" class="s-blk"/><text x="200" y="126" class="s-blkt">100g</text><text x="200" y="140" class="s-blkt">40cm³</text>`;
  g += arrow(213, 190, 213, 153, "up") + `<text x="232" y="180" class="s-tm">浮力 40g</text>`;
  g += arrow(135, 150, 135, 198, "dn") + `<text x="102" y="176" text-anchor="end" class="s-tm">40g</text><text x="102" y="192" text-anchor="end" class="s-t">底面向き</text>`;
  g += `<rect x="100" y="204" width="200" height="6" class="s-ceil"/>`;
  g += `<rect x="120" y="210" width="160" height="34" rx="4" class="s-scale"/><text x="200" y="232" text-anchor="middle" class="s-tm">300g → 340g</text>`;
  g += `<text x="200" y="262" class="s-cap">ばねばかり60g＋台ばかり340g＝100g＋300g</text>`;
  return svgWrap(g, 400, 272);
}
function renderFig(f){
  if (f.t === "table"){
    return `<table><tr><th>${f.h[0]}</th>${f.r[0].map(v=>`<td>${v}</td>`).join("")}</tr><tr><th>${f.h[1]}</th>${f.r[1].map(v=>`<td>${v}</td>`).join("")}</tr></table>`;
  }
  if (f.t === "forces") return forces(f);
  const panels = f.t === "multi" ? f.p : [f];
  const parts = panels.map(hang);
  const W = parts.reduce((a,p)=>a+p.w,0), H = Math.max(...parts.map(p=>p.h));
  let x=0, inner="";
  parts.forEach(p=>{ inner += `<g transform="translate(${x},0)">${p.g}</g>`; x+=p.w; });
  return svgWrap(inner, W, H);
}

/* ---------- questions ---------- */
let Q = [];   // questions/*.json から読み込み

/* ---------- app ---------- */
const $ = id => document.getElementById(id);
const STAGES = [
  {name:"ウォーミングアップ", sub:"STEP 1〜4　ばね・浮力の基本", steps:[1,2,3,4], n:4},
  {name:"力試し", sub:"STEP 5〜8　逆算・液体・つなぎ方・台ばかり", steps:[5,6,7,8], n:4},
  {name:"ファイナルステージ", sub:"5〜8を組み合わせた複合問題", steps:["B"], n:2},
];
let BOSSES = [];   // prizes/bosses.json から読み込み
const store = {
  get(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};
let stage = 0, list = [], idx = 0, results = [], answered = false, hp = 0, boss = null;
const shuf = a => { a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };

/* 15体を1袋に入れて順に出す。袋が空になったら入れ直す（15回で必ず一巡） */
function nextBoss(){
  const pend = BOSSES.find(b=>b.id===store.get("dtb-pending", null));
  if (pend) return pend;   // 負けた（または途中でやめた）ボスに再挑戦
  let bag = store.get("dtb-bag", []).filter(id=>BOSSES.some(b=>b.id===id));
  const last = store.get("dtb-last", null);
  if (!bag.length){
    bag = shuf(BOSSES.map(b=>b.id));
    if (bag.length > 1 && bag[bag.length-1] === last) [bag[0], bag[bag.length-1]] = [bag[bag.length-1], bag[0]];
  }
  const id = bag.pop();
  store.set("dtb-bag", bag); store.set("dtb-last", id);
  return BOSSES.find(b=>b.id===id);
}
const bossPic = (b, cls="bimg") => `<div class="${cls}"><span>No.${b.no}</span><img src="${b.img}" alt="${b.name}" onerror="this.remove()"></div>`;

function draw(st){
  if (st.steps[0] === "B") return shuf(Q.filter(q=>q.s==="B")).slice(0, st.n);
  const per = st.steps.map(s=>shuf(Q.filter(q=>q.s===s)));
  const picks = per.map(a=>a[0]);
  const extra = shuf(per.filter(a=>a.length>1));
  for (let i=0; picks.length < st.n && i < extra.length; i++) picks.push(extra[i][1]);
  return shuf(picks.slice(0, st.n));
}
function drawMap(){
  $("stageMap").innerHTML = STAGES.map((s,i)=>{
    const st = i < stage ? "done" : i === stage ? "now" : "lock";
    const mark = st==="done" ? "クリア" : st==="now" ? "挑戦中" : "未開放";
    return `<li class="st ${st}"><span class="st-n">${i+1}</span><span class="st-b"><b>${s.name}</b></span><span class="st-m">${mark}</span></li>`;
  }).join("");
  $("startBtn").textContent = `${STAGES[stage].name}をはじめる`;
  const def = store.get("dtb-defeated", {});
  $("zukanBtn").textContent = `倒したボス一覧（${BOSSES.filter(b=>def[b.id]).length} / ${BOSSES.length}）`;
}
function begin(){
  list = draw(STAGES[stage]); idx = 0; results = []; hp = list.length;
  boss = stage === 2 ? nextBoss() : null;
  if (boss) store.set("dtb-pending", boss.id);
  $("start").hidden = true; $("result").hidden = true; $("zukan").hidden = true; $("quiz").hidden = false;
  $("quiz").classList.toggle("boss", stage === 2);
  $("bossPanel").hidden = stage !== 2;
  if (boss) $("bossPic").innerHTML = bossPic(boss);
  show();
  if (boss) showIntro();
}
function showIntro(){
  $("introImg").innerHTML = `<span>No.${boss.no}</span><img src="${boss.img}" alt="${boss.name}" onerror="this.remove()">`;
  $("introName").textContent = boss.name;
  $("introHp").textContent = `HP ${"■".repeat(list.length)}`;
  $("intro").hidden = false; window.scrollTo(0,0); $("intro").focus({preventScroll:true});
}
function closeIntro(){
  if ($("intro").hidden) return;
  $("intro").hidden = true;
  const inp = $("numIn"); if (inp) inp.focus({preventScroll:true});
}
$("intro").addEventListener("click", closeIntro);
$("intro").addEventListener("keydown", e=>{ if (e.key==="Enter"||e.key===" ") { e.preventDefault(); closeIntro(); } });
$("startBtn").addEventListener("click", begin);

function drawHp(){
  if (!boss) return;
  $("bossName").textContent = boss.name;
  $("bossHp").textContent = `HP ${"■".repeat(hp)}${"□".repeat(list.length-hp)}`;
}
function show(){
  const q = list[idx]; answered = false;
  $("stageName").textContent = STAGES[stage].name;
  drawHp();
  $("progTxt").textContent = `${idx+1} / ${list.length}`;
  $("progBar").style.width = `${idx/list.length*100}%`;
  $("scoreTxt").textContent = `正解 ${results.filter(r=>r.ok).length}`;
  $("qTag").textContent = q.s === "B" ? `ボス｜STEP ${q.combo}` : `STEP ${q.s}｜${STEPS[q.s]}`;
  $("qText").textContent = q.q;
  $("know").hidden = true;
  $("qFig").innerHTML = renderFig(q.fig);
  $("fb").hidden = true; $("nextBtn").hidden = true;
  if (q.c){
    $("qAns").innerHTML = `<div class="choices">${shuf(q.c).map(c=>`<button class="choice" data-c="${c}">${c}</button>`).join("")}</div>`;
  } else {
    $("qAns").innerHTML = `<form class="num" id="numForm"><input id="numIn" inputmode="decimal" autocomplete="off" aria-label="答え"><span class="unit">${q.unit}</span><button class="btn" type="submit">答える</button></form>`;
    $("numForm").addEventListener("submit", e=>{ e.preventDefault(); const v = norm($("numIn").value); if (v===null) return; judge(Math.abs(v - q.num) < 1e-6); });
    $("numIn").focus({preventScroll:true});
  }
}
function norm(s){
  s = s.replace(/[０-９．]/g, c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/[^\d.\-]/g,"");
  if (s==="" || isNaN(+s)) return null; return +s;
}
$("qAns").addEventListener("click", e=>{
  const b = e.target.closest(".choice"); if(!b || answered) return;
  const q = list[idx], ok = b.dataset.c === q.c[0];
  document.querySelectorAll(".choice").forEach(x=>{ x.disabled = true; if (x.dataset.c===q.c[0]) x.classList.add("ok"); });
  if (!ok) b.classList.add("ng");
  judge(ok);
});
function judge(ok){
  if (answered) return; answered = true;
  const q = list[idx];
  results.push({q, ok});
  if (ok && boss) { hp--; drawHp(); }
  const ans = q.c ? q.c[0] : `${q.num}${q.unit}`;
  $("fbRes").className = "res " + (ok ? "ok" : "ng");
  $("fbRes").textContent = ok ? (boss ? "正解！ ボスに命中" : "正解") : `不正解（正解：${ans}）`;
  $("fbExp").textContent = q.exp;
  $("fb").hidden = false; $("nextBtn").hidden = false;
  if (stage === 1 && q.s === 8){
    if (!$("knowFig").innerHTML) $("knowFig").innerHTML = knowFig();
    $("know").hidden = false;
  }
  $("nextBtn").textContent = idx === list.length-1 ? "結果を見る" : "次へ";
  const inp = $("numIn"); if (inp) inp.disabled = true;
  $("scoreTxt").textContent = `正解 ${results.filter(r=>r.ok).length}`;
  $("nextBtn").focus({preventScroll:true});
}
$("nextBtn").addEventListener("click", ()=>{ idx++; idx < list.length ? show() : finish(); });
$("quitBtn").addEventListener("click", home);

let nextAction = null;
function finish(){
  $("quiz").hidden = true; $("result").hidden = false;
  const ok = results.filter(r=>r.ok).length, all = ok === results.length;
  const st = STAGES[stage];
  $("resScore").textContent = `${ok} / ${results.length}`;
  $("resBoss").innerHTML = boss ? bossPic(boss, "bimg big" + (all ? "" : " lost")) : "";
  const wrong = results.filter(r=>!r.ok);
  $("resWrong").innerHTML = wrong.length ? `<span class="lbl">まちがえた問題</span>` + wrong.map(r=>
    `<div class="wq"><span class="tag">${r.q.s==="B" ? "ボス｜STEP "+r.q.combo : "STEP "+r.q.s+"｜"+STEPS[r.q.s]}</span><span>${r.q.q.split("\n").pop()}</span><span class="wa">正解：${r.q.c ? r.q.c[0] : r.q.num + r.q.unit}</span></div>`).join("") : "";
  $("resetBtn").hidden = stage === 0;
  if (all && stage < 2){
    $("resTitle").textContent = `${st.name} クリア！`;
    $("resSub").textContent = `次は「${STAGES[stage+1].name}」です。`;
    $("resMain").textContent = `${STAGES[stage+1].name}へ進む`;
    nextAction = ()=>{ stage++; begin(); };
  } else if (all){
    const def = store.get("dtb-defeated", {});
    const first = !def[boss.id];
    def[boss.id] = (def[boss.id] || 0) + 1; store.set("dtb-defeated", def);
    store.set("dtb-pending", null);
    $("resTitle").textContent = `${boss.name}をたおした！`;
    $("resSub").textContent = first ? "ボス一覧に登録しました。" : `${def[boss.id]}回目の撃破です。`;
    $("resMain").textContent = "最初から挑戦する";
    $("resetBtn").hidden = true;
    stage = 0;
    nextAction = begin;
  } else {
    $("resTitle").textContent = boss ? `${boss.name}にやられた…` : `${st.name} 失敗`;
    $("resSub").textContent = boss ? "全問正解で撃破です。もう一度挑戦すると、同じボスと新しい問題で戦います。"
                                   : `全問正解で次へ進めます。もう一度挑戦すると、新しい${st.n}問が出ます。`;
    $("resMain").textContent = "もう一度挑戦する";
    nextAction = begin;
  }
}
$("resMain").addEventListener("click", ()=> nextAction && nextAction());
$("resetBtn").addEventListener("click", ()=>{ stage = 0; home(); });
$("resZukan").addEventListener("click", openZukan);

function openZukan(){
  const def = store.get("dtb-defeated", {});
  $("zukanCount").textContent = `${BOSSES.filter(b=>def[b.id]).length} / ${BOSSES.length} 体`;
  $("zukanGrid").innerHTML = BOSSES.map(b => def[b.id]
    ? `<div class="zk">${bossPic(b)}<b>${b.name}</b><small>撃破 ${def[b.id]}回</small></div>`
    : `<div class="zk lock"><div class="bimg"><span>？</span></div><b>？？？</b><small>No.${b.no}</small></div>`).join("");
  $("start").hidden = true; $("result").hidden = true; $("quiz").hidden = true; $("zukan").hidden = false;
}
$("zukanBtn").addEventListener("click", openZukan);
$("zukanBack").addEventListener("click", home);
function home(){ $("quiz").hidden = true; $("result").hidden = true; $("zukan").hidden = true; $("start").hidden = false; boss = null; drawMap(); }
/* ---------- 起動：問題とボスを読み込む ---------- */
async function init(){
  try {
    const get = f => fetch(f, {cache:"no-cache"}).then(r=>{ if(!r.ok) throw new Error(f); return r.json(); });
    const [w, c, f, b] = await Promise.all(["questions/warmup.json","questions/challenge.json","questions/final.json","prizes/bosses.json"].map(get));
    Q = [...w, ...c, ...f]; Q.forEach((q,i)=>q.id=i);
    BOSSES = b.map((x,i)=>({ id:x.id, no:String(i+1).padStart(2,"0"), name:x.name, img:`prizes/${x.file}` }));
    drawMap();
  } catch(err){
    $("startBtn").disabled = true;
    $("startBtn").textContent = "読み込みに失敗しました";
    console.error(err);
  }
}
init();
