"use strict";

// Landing draw: shuffle four face-down cards, sweep, flip the drawn one, then lock the group.
// With a group number the draw is balanced (groups 1–4 cover all four agencies, 5–8 again);
// without one it is uniformly random.

const DRAW_TAGLINE = {
  fda: "2021 年审评 · 手上有全球 III 期汇总数据",
  ema: "2021 年审评 · 手上有全球 III 期汇总数据",
  nmpa: "2018 年审评 · 全球心血管汇总尚未出来",
  pmda: "2019 年审评 · 依据日本的研究"
};

function hashString(s) {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function balancedAgency(groupNo) {
  const block = Math.floor((groupNo - 1) / 4), slot = (groupNo - 1) % 4;
  const rnd = rngFrom(hashString(`${CLASS_SEED}#${block}`));
  const perm = [...AGENCY_ORDER];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm[slot];
}

function randomAgency() {
  const buf = new Uint32Array(1);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  return AGENCY_ORDER[buf[0] % AGENCY_ORDER.length];
}

const stage = document.getElementById("draw-stage");
const table = document.getElementById("draw-table");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let cards = [];
let drawing = false;

function cardFace(k) {
  const a = AGENCIES[k];
  return `<div class="dc-face dc-${k}">
    <span class="dc-kicker">你们组扮演</span>
    <span class="dc-emblem"><span>${a.short}</span></span>
    <span class="dc-name">${a.name}</span>
    <span class="dc-when">决策节点 ${a.when}</span>
    <span class="dc-tag">${DRAW_TAGLINE[k]}</span>
  </div>`;
}

function layout() {
  const w = table.clientWidth, narrow = w < 560;
  const cw = narrow ? Math.min(150, (w - 18) / 2) : Math.min(176, (w - 3 * 22) / 4);
  const ch = cw * 1.45;
  table.style.height = `${narrow ? ch * 2 + 20 : ch + 40}px`;
  return cards.map((_, i) => {
    if (narrow) {
      const col = i % 2, row = Math.floor(i / 2);
      return { x: (w - (2 * cw + 18)) / 2 + col * (cw + 18), y: row * (ch + 20), w: cw, h: ch, r: 0 };
    }
    const total = 4 * cw + 3 * 22, x0 = (w - total) / 2;
    return { x: x0 + i * (cw + 22), y: 20 + Math.abs(i - 1.5) * 8, w: cw, h: ch, r: (i - 1.5) * 3 };
  });
}

function place(el, p, extra = "") {
  el.style.width = `${p.w}px`;
  el.style.height = `${p.h}px`;
  el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg) ${extra}`;
}

function buildCards(chosen) {
  const others = AGENCY_ORDER.filter(k => k !== chosen);
  table.innerHTML = "";
  cards = [0, 1, 2, 3].map(i => {
    const el = document.createElement("div");
    el.className = "dcard";
    el.innerHTML = `<div class="dc-inner"><div class="dc-back"><span class="dc-mark">BRA</span><span class="dc-sub">罗沙司他 · 审评</span></div>${cardFace(i === 0 ? chosen : others[i - 1])}</div>`;
    table.appendChild(el);
    return el;
  });
  const pos = layout();
  cards.forEach((el, i) => place(el, pos[i]));
}

const anim = (el, frames, opts) => el.animate(frames, { fill: "forwards", easing: "cubic-bezier(.2,.7,.2,1)", ...opts }).finished;

async function runDraw(chosen) {
  drawing = true;
  stage.classList.add("is-drawing");
  buildCards(chosen);
  const pos = layout();
  const w = table.clientWidth;
  const center = { x: w / 2 - pos[0].w / 2, y: (parseFloat(table.style.height) - pos[0].h) / 2 };
  const tf = (p, extra = "") => `translate(${p.x}px, ${p.y}px) rotate(${p.r || 0}deg) ${extra}`;

  if (!reduceMotion) {
    // gather into a stack
    await Promise.all(cards.map((el, i) => anim(el, [{ transform: tf(pos[i]) }, { transform: tf({ ...center, r: (i - 1.5) * 4 }) }], { duration: 520, delay: i * 50 })));
    // riffle three times
    for (let round = 0; round < 2; round++) {
      await Promise.all(cards.map((el, i) => {
        const dir = (i + round) % 2 ? 1 : -1;
        const out = { x: center.x + dir * pos[0].w * 0.42, y: center.y - 10, r: dir * 7 };
        const back = { ...center, r: (i - 1.5) * 4 };
        return anim(el, [{ transform: tf(back) }, { transform: tf(out), offset: 0.45 }, { transform: tf(back) }], { duration: 420, delay: i * 35, easing: "ease-in-out" });
      }));
    }
    // deal back out in a new order; the chosen card (index 0) lands on a random slot
    const slots = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    await Promise.all(cards.map((el, i) => anim(el, [{ transform: tf({ ...center, r: (i - 1.5) * 4 }) }, { transform: tf(pos[slots[i]]) }], { duration: 560, delay: i * 90 })));
    // sweep a highlight that slows down and stops on the chosen card
    const target = slots[0], bySlot = [];
    slots.forEach((s, i) => { bySlot[s] = cards[i]; });
    const steps = 8 + target;
    for (let k = 0; k <= steps; k++) {
      bySlot.forEach(c => c.classList.remove("is-lit"));
      bySlot[k % 4].classList.add("is-lit");
      await sleep(60 + k * k * 2.2);
    }
    bySlot.forEach(c => { if (c !== cards[0]) c.classList.add("is-dim"); });
    // lift the chosen card above the others, to the centre, then flip it
    cards.forEach((c, i) => { c.style.zIndex = i === 0 ? 5 : 1; });
    const lifted = { x: w / 2 - pos[0].w / 2, y: center.y + 8, r: 0 };
    await anim(cards[0], [{ transform: tf(pos[target]) }, { transform: tf(lifted, "scale(1.28)") }], { duration: 640 });
  } else {
    const lifted = { x: w / 2 - pos[0].w / 2, y: center.y + 8, r: 0 };
    cards.forEach((c, i) => { c.style.zIndex = i === 0 ? 5 : 1; });
    cards.slice(1).forEach(c => c.classList.add("is-dim"));
    cards[0].style.transform = tf(lifted, "scale(1.28)");
  }
  cards[0].classList.add("is-chosen");
  cards[0].querySelector(".dc-inner").classList.add("is-flipped");
  await sleep(reduceMotion ? 0 : 750);
  const a = AGENCIES[chosen];
  document.getElementById("draw-result").innerHTML = `<p class="dr-line">你们组扮演 <b>${a.name}</b></p>
    <p class="dr-sub">揭晓前，你们只能看到这家机构在 ${a.when} 做决定时手上的证据。</p>
    <button class="draw-btn" type="button" id="draw-enter">进入审评室</button>`;
  stage.classList.add("is-done");
  document.getElementById("draw-enter").focus();
  drawing = false;
}

function openStage() {
  stage.hidden = false;
  document.body.classList.add("draw-open");
  buildCards(AGENCY_ORDER[0]);
  setTimeout(() => document.getElementById("draw-start")?.focus(), 50);
}

function closeStage() {
  stage.classList.add("is-leaving");
  setTimeout(() => {
    stage.hidden = true;
    stage.classList.remove("is-leaving", "is-drawing", "is-done");
    document.body.classList.remove("draw-open");
    window.scrollTo({ top: 0, behavior: "instant" });
  }, reduceMotion ? 0 : 450);
}

document.getElementById("draw-form").addEventListener("submit", e => {
  e.preventDefault();
  if (drawing || state.agency) return;
  const n = parseInt(document.getElementById("draw-group").value, 10);
  const chosen = Number.isInteger(n) && n > 0 && n < 100 ? balancedAgency(n) : randomAgency();
  state.draw = { group: Number.isInteger(n) && n > 0 && n < 100 ? n : null, at: new Date().toISOString() };
  state.agency = chosen; state.viewAgency = chosen;
  save();
  runDraw(chosen);
});
stage.addEventListener("click", e => {
  if (e.target.id === "draw-enter") { renderAll(); closeStage(); }
});
window.addEventListener("resize", () => {
  if (stage.hidden || drawing || stage.classList.contains("is-done")) return;
  const pos = layout();
  cards.forEach((el, i) => place(el, pos[i]));
});

if (!state.agency) openStage();
