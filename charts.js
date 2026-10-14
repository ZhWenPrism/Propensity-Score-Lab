"use strict";

const COLOR = { teal: "#0c7b60", coral: "#d87358", ink: "#17313a", muted: "#657c81", grid: "#e8efec", axis: "#c3d3cd", gray: "#97a8a4", surface: "#ffffff" };
const groupColor = treated => (treated ? COLOR.teal : COLOR.coral);

const fmt = (x, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : "—");
const fmtPS = x => (!Number.isFinite(x) ? "—" : x < 0.0005 ? "<0.001" : x > 0.9995 ? ">0.999" : x.toFixed(3));
const fmtP = p => (!Number.isFinite(p) ? "—" : p < 0.001 ? "<0.001" : p.toFixed(3));
const pct = (x, n = 1) => (Number.isFinite(x) ? `${(100 * x).toFixed(n)}%` : "—");
const signedPP = (x, n = 1) => (Number.isFinite(x) ? `${x >= 0 ? "+" : "−"}${Math.abs(100 * x).toFixed(n)}` : "—");
const hrText = c => (c ? `${fmt(c.hr)} (${fmt(c.lo)}–${fmt(c.hi)})` : "无法估计");
const rdText = r => `${signedPP(r.rd)} (${signedPP(r.rdLo)} 至 ${signedPP(r.rdHi)})`;
const svgOpen = (W, H, label) => `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">`;
const text = (x, y, s, attrs = "") => `<text x="${x}" y="${y}" ${attrs}>${s}</text>`;

function barPath(x, base, w, h, dir) {
  if (h < 0.05) return "";
  const r = Math.min(1.8, h, w / 2), end = base + dir * h;
  return `M${x},${base}V${end - dir * r}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${end - dir * r}V${base}Z`;
}

// ---- PS histograms -------------------------------------------------------

const HIST_BINS = 20;
function massBins(cohort, ps, w) {
  const t = Array(HIST_BINS).fill(0), c = Array(HIST_BINS).fill(0);
  let wt = 0, wc = 0;
  cohort.forEach((p, i) => {
    if (!w[i]) return;
    const b = Math.min(HIST_BINS - 1, Math.floor(ps[i] * HIST_BINS));
    if (p.treated) { t[b] += w[i]; wt += w[i]; } else { c[b] += w[i]; wc += w[i]; }
  });
  return { t: t.map(x => (wt ? x / wt : 0)), c: c.map(x => (wc ? x / wc : 0)) };
}
const overlap = m => m.t.reduce((s, x, b) => s + Math.min(x, m.c[b]), 0);

function histogramSvg(mass, rawMass, maxMass, label) {
  const W = 300, H = 178, L = 6, R = 6, T = 6, B = 20;
  const mid = T + (H - T - B) / 2, half = (H - T - B) / 2 - 2;
  const bw = (W - L - R) / HIST_BINS, k = half / maxMass;
  let s = svgOpen(W, H, label);
  [0.25, 0.5, 0.75].forEach(q => { const x = L + q * (W - L - R); s += `<line x1="${x}" y1="${T}" x2="${x}" y2="${H - B}" stroke="${COLOR.grid}"/>`; });
  for (let b = 0; b < HIST_BINS; b++) {
    const x = L + b * bw + 1, w = bw - 2;
    s += `<path d="${barPath(x, mid - 1, w, mass.t[b] * k, -1)}" fill="${COLOR.teal}"/>`;
    s += `<path d="${barPath(x, mid + 1, w, mass.c[b] * k, 1)}" fill="${COLOR.coral}"/>`;
  }
  if (rawMass) {
    const outline = (arr, dir) => {
      let d = `M${L},${mid}`;
      arr.forEach((v, b) => { d += `V${mid + dir * v * k}H${L + (b + 1) * bw}`; });
      return `<path d="${d}V${mid}" fill="none" stroke="${COLOR.gray}" stroke-width="1.2" stroke-linejoin="round"/>`;
    };
    s += outline(rawMass.t, -1) + outline(rawMass.c, 1);
  }
  s += `<line x1="${L}" y1="${mid}" x2="${W - R}" y2="${mid}" stroke="${COLOR.axis}"/>`;
  for (let b = 0; b < HIST_BINS; b++) {
    const lo = b / HIST_BINS, hi = (b + 1) / HIST_BINS;
    const tip = `PS ${lo.toFixed(2)}–${hi.toFixed(2)}<br>去甲组 ${pct(mass.t[b])} · 对照组 ${pct(mass.c[b])}` + (rawMass ? `<br>调整前 ${pct(rawMass.t[b])} · ${pct(rawMass.c[b])}` : "");
    s += `<rect x="${L + b * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-tip="${tip}"/>`;
  }
  [[0, "0"], [0.5, "0.5"], [1, "1"]].forEach(([q, t], j) => {
    s += text(L + q * (W - L - R), H - 5, t, `class="tick" text-anchor="${["start", "middle", "end"][j]}"`);
  });
  return s + "</svg>";
}

// ---- Cohort beeswarm ----------------------------------------------------

const SWARM_WIDTH = 560;
const SWARM_STEP = 7.4;
function swarmLayout(points, width) {
  const L = 20, R = 20, sx = v => L + v * (width - L - R);
  const up = [], down = [], placed = new Map();
  [...points].sort((a, b) => a.x - b.x).forEach(p => {
    const levels = p.up ? up : down, px = sx(p.x);
    let k = 0;
    while (k < levels.length && px - levels[k] < SWARM_STEP) k++;
    levels[k] = px;
    placed.set(p.id, { px, k, up: p.up });
  });
  return { placed, nUp: up.length, nDown: down.length, L, R, width };
}

function swarmSvg(layout, items, selectedId) {
  const { placed, nUp, nDown, L, R, width: W } = layout;
  const T = 8, gap = 5, B = 24, r0 = 3.1;
  const axisY = T + nUp * SWARM_STEP + gap;
  const H = axisY + gap + nDown * SWARM_STEP + B;
  let s = svgOpen(W, H, "按 PS 排列的患者");
  [0, 0.25, 0.5, 0.75, 1].forEach(q => {
    const x = L + q * (W - L - R);
    s += `<line x1="${x}" y1="${T}" x2="${x}" y2="${H - B + 4}" stroke="${COLOR.grid}"/>`;
    s += text(x, H - 6, q === 0 ? "PS 0" : String(q), `class="tick" text-anchor="${q === 0 ? "start" : q === 1 ? "end" : "middle"}"`);
  });
  s += `<line x1="${L}" y1="${axisY}" x2="${W - R}" y2="${axisY}" stroke="${COLOR.axis}"/>`;
  const drawn = items.map(it => {
    const pos = placed.get(it.id);
    const cy = pos.up ? axisY - gap - SWARM_STEP / 2 - pos.k * SWARM_STEP : axisY + gap + SWARM_STEP / 2 + pos.k * SWARM_STEP;
    return { ...it, cx: pos.px, cy, r: Math.max(1.1, r0 * Math.sqrt(it.rel)) };
  }).sort((a, b) => b.r - a.r);
  let selected = null;
  for (const d of drawn) {
    const color = groupColor(d.treated);
    let mark;
    if (d.mode === "excluded") mark = `<circle cx="${d.cx}" cy="${d.cy}" r="${r0}" fill="${COLOR.surface}" stroke="${COLOR.gray}" stroke-width="1.2"/>`;
    else if (d.mode === "hollow") mark = `<circle cx="${d.cx}" cy="${d.cy}" r="${r0 - 0.5}" fill="${COLOR.surface}" stroke="${color}" stroke-width="1.1" opacity=".75"/>`;
    else if (d.mode === "weight") mark = `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="${color}" fill-opacity=".62" stroke="${COLOR.surface}" stroke-width=".9"/>`;
    else mark = `<circle cx="${d.cx}" cy="${d.cy}" r="${r0}" fill="${color}" stroke="${COLOR.surface}" stroke-width=".8"/>`;
    const hit = d.r < 4.5 ? `<circle cx="${d.cx}" cy="${d.cy}" r="4.5" fill="transparent"/>` : "";
    s += `<g class="pt" data-id="${d.id}" data-tip="${d.tip}">${mark}${hit}</g>`;
    if (d.id === selectedId) selected = d;
  }
  if (selected) s += `<circle cx="${selected.cx}" cy="${selected.cy}" r="${(selected.mode === "weight" ? selected.r : r0) + 2.6}" fill="none" stroke="${COLOR.ink}" stroke-width="1.8" pointer-events="none"/>`;
  return s + "</svg>";
}

// ---- Step 1 scatter -----------------------------------------------------

function scatterSvg(points, selectedId) {
  const W = 320, H = 300, L = 36, R = 10, T = 10, B = 34;
  const sx = v => L + v * (W - L - R), sy = v => H - B - v * (H - T - B);
  let s = svgOpen(W, H, "PS 散点图");
  [0, 0.25, 0.5, 0.75, 1].forEach(q => {
    s += `<line x1="${sx(q)}" y1="${T}" x2="${sx(q)}" y2="${H - B}" stroke="${COLOR.grid}"/><line x1="${L}" y1="${sy(q)}" x2="${W - R}" y2="${sy(q)}" stroke="${COLOR.grid}"/>`;
    s += text(sx(q), H - B + 13, q, `class="tick" text-anchor="middle"`) + text(L - 5, sy(q) + 3, q, `class="tick" text-anchor="end"`);
  });
  s += `<line x1="${sx(0)}" y1="${sy(0)}" x2="${sx(1)}" y2="${sy(1)}" stroke="${COLOR.axis}" stroke-width="1.2"/>`;
  s += text((L + W - R) / 2, H - 4, "默认模型 PS", `class="axis-title" text-anchor="middle"`);
  s += text(11, (T + H - B) / 2, "当前模型 PS", `class="axis-title" text-anchor="middle" transform="rotate(-90 11 ${(T + H - B) / 2})"`);
  let sel = null;
  points.forEach(p => {
    const cx = sx(p.x), cy = sy(p.y), color = groupColor(p.treated);
    const mark = p.excluded
      ? `<circle cx="${cx}" cy="${cy}" r="2.4" fill="${COLOR.surface}" stroke="${COLOR.gray}" stroke-width="1"/>`
      : p.treated ? `<circle cx="${cx}" cy="${cy}" r="2.6" fill="${color}" fill-opacity=".75"/>`
        : `<circle cx="${cx}" cy="${cy}" r="2.3" fill="${COLOR.surface}" stroke="${color}" stroke-width="1.2"/>`;
    s += `<g class="pt" data-id="${p.id}" data-tip="${p.tip}">${mark}<circle cx="${cx}" cy="${cy}" r="4.5" fill="transparent"/></g>`;
    if (p.id === selectedId) sel = { cx, cy };
  });
  if (sel) s += `<circle cx="${sel.cx}" cy="${sel.cy}" r="6" fill="none" stroke="${COLOR.ink}" stroke-width="1.8" pointer-events="none"/>`;
  return s + "</svg>";
}

// ---- Love plot ----------------------------------------------------------

const LOVE_MARKS = {
  raw: { label: "原始", dy: -7.5, draw: (x, y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${COLOR.surface}" stroke="${COLOR.gray}" stroke-width="1.5"/>` },
  psm: { label: "PSM", dy: -2.5, draw: (x, y) => `<rect x="${x - 3.3}" y="${y - 3.3}" width="6.6" height="6.6" rx="1" fill="${COLOR.ink}" stroke="${COLOR.surface}" stroke-width="1"/>` },
  iptw: { label: "IPTW", dy: 2.5, draw: (x, y) => `<path d="M${x},${y - 4.2}L${x + 4},${y + 3}L${x - 4},${y + 3}Z" fill="${COLOR.surface}" stroke="${COLOR.ink}" stroke-width="1.4" stroke-linejoin="round"/>` },
  ow: { label: "OW", dy: 7.5, draw: (x, y) => `<path d="M${x},${y - 4.3}L${x + 4.3},${y}L${x},${y + 4.3}L${x - 4.3},${y}Z" fill="${COLOR.muted}" stroke="${COLOR.surface}" stroke-width="1"/>` }
};
const loveKey = m => `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">${LOVE_MARKS[m].draw(6, 6 - (m === "iptw" ? -0.4 : 0))}</svg>`;

function loveSvg(rows, maxX) {
  const rowH = 32, W = 560, L = 150, R = 18, T = 8, B = 26, H = T + rows.length * rowH + B;
  const sx = v => L + Math.min(v, maxX) / maxX * (W - L - R);
  const step = maxX > 1 ? 0.25 : 0.1;
  let s = svgOpen(W, H, "Love plot");
  for (let v = 0; v <= maxX + 1e-9; v += step) {
    s += `<line x1="${sx(v)}" y1="${T}" x2="${sx(v)}" y2="${H - B}" stroke="${COLOR.grid}"/>` + text(sx(v), H - 9, +v.toFixed(2), `class="tick" text-anchor="middle"`);
  }
  s += `<line x1="${sx(0.1)}" y1="${T}" x2="${sx(0.1)}" y2="${H - B}" stroke="${COLOR.muted}" stroke-width="1.2"/>`;
  rows.forEach((row, j) => {
    const y = T + j * rowH + rowH / 2;
    if (j) s += `<line x1="8" y1="${T + j * rowH}" x2="${W - R}" y2="${T + j * rowH}" stroke="${COLOR.grid}"/>`;
    s += text(10, y - 2, row.name, `class="row-label${row.inModel ? "" : " off"}"`);
    s += text(10, y + 11, row.tag, `class="row-tag"`);
    METHODS.forEach(m => {
      const v = Math.abs(row.values[m]);
      s += `<g data-tip="${row.name} · ${LOVE_MARKS[m].label}<br>|SMD| = ${fmt(v, 3)}${v > maxX ? "（超出坐标范围）" : ""}">${LOVE_MARKS[m].draw(sx(v), y + LOVE_MARKS[m].dy)}<rect x="${sx(v) - 5}" y="${y + LOVE_MARKS[m].dy - 3}" width="10" height="6" fill="transparent"/></g>`;
    });
  });
  return s + "</svg>";
}

// ---- Kaplan–Meier -------------------------------------------------------

const KM_GEOM = { W: 320, H: 210, L: 34, R: 66, T: 10, B: 26 };
const survivalAt = (steps, t) => { let s = 1; for (const st of steps) { if (st.t <= t) s = st.s; else break; } return s; };

function kmSvg(km1, km0, yMin, id) {
  const { W, H, L, R, T, B } = KM_GEOM;
  const sx = t => L + t / FOLLOW_UP * (W - L - R), sy = v => H - B - (v - yMin) / (1 - yMin) * (H - T - B);
  const step = 1 - yMin > 0.45 ? 0.2 : 0.1;
  let s = svgOpen(W, H, "Kaplan–Meier 曲线");
  for (let v = 1; v >= yMin - 1e-9; v -= step) {
    s += `<line x1="${L}" y1="${sy(v)}" x2="${W - R}" y2="${sy(v)}" stroke="${COLOR.grid}"/>` + text(L - 5, sy(v) + 3, v.toFixed(1), `class="tick" text-anchor="end"`);
  }
  [0, 7, 14, 21, 28].forEach(d => { s += text(sx(d), H - 9, d === 28 ? "28 天" : d, `class="tick" text-anchor="middle"`); });
  s += `<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${COLOR.axis}"/>`;
  const path = steps => {
    let d = `M${sx(0)},${sy(1)}`;
    steps.slice(1).forEach(st => { d += `H${sx(st.t)}V${sy(st.s)}`; });
    return d + `H${sx(FOLLOW_UP)}`;
  };
  s += `<path d="${path(km0)}" fill="none" stroke="${COLOR.coral}" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<path d="${path(km1)}" fill="none" stroke="${COLOR.teal}" stroke-width="2" stroke-linejoin="round"/>`;
  const end1 = survivalAt(km1, FOLLOW_UP), end0 = survivalAt(km0, FOLLOW_UP);
  let y1 = sy(end1), y0 = sy(end0);
  if (Math.abs(y1 - y0) < 12) { const m = (y1 + y0) / 2, dir = end1 >= end0 ? -1 : 1; y1 = m + dir * 6; y0 = m - dir * 6; }
  const x = W - R + 4;
  s += `<line x1="${x}" y1="${y1}" x2="${x + 7}" y2="${y1}" stroke="${COLOR.teal}" stroke-width="2"/>` + text(x + 10, y1 + 3.5, `去甲 ${pct(end1, 0)}`, `class="end-label"`);
  s += `<line x1="${x}" y1="${y0}" x2="${x + 7}" y2="${y0}" stroke="${COLOR.coral}" stroke-width="2"/>` + text(x + 10, y0 + 3.5, `对照 ${pct(end0, 0)}`, `class="end-label"`);
  s += `<line class="km-cross" x1="0" y1="${T}" x2="0" y2="${H - B}" stroke="${COLOR.muted}" visibility="hidden"/>`;
  s += `<rect class="km-hit" data-km="${id}" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>`;
  return s + "</svg>";
}

// ---- Forest plot --------------------------------------------------------

function forestSvg(rows) {
  const rowH = 44, W = 520, L = 168, R = 18, T = 8, B = 34, H = T + rows.length * rowH + B;
  const vals = rows.flatMap(r => [r.lo, r.hi, r.truth]).filter(Number.isFinite);
  let lo = Math.min(0.5, ...vals) / 1.12, hi = Math.max(1.5, ...vals) * 1.12;
  lo = Math.max(lo, 0.1); hi = Math.min(hi, 10);
  const sx = v => L + (Math.log(clamp(v, lo, hi)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * (W - L - R);
  let s = svgOpen(W, H, "HR 森林图");
  [0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6].filter(v => v >= lo && v <= hi).forEach(v => {
    s += `<line x1="${sx(v)}" y1="${T}" x2="${sx(v)}" y2="${H - B}" stroke="${COLOR.grid}"/>` + text(sx(v), H - B + 13, v, `class="tick" text-anchor="middle"`);
  });
  s += `<line x1="${sx(1)}" y1="${T}" x2="${sx(1)}" y2="${H - B}" stroke="${COLOR.muted}" stroke-width="1.2"/>`;
  s += text(sx(1) - 6, H - 4, "← 去甲组风险更低", `class="tick" text-anchor="end"`) + text(sx(1) + 6, H - 4, "去甲组风险更高 →", `class="tick"`);
  rows.forEach((r, j) => {
    const y = T + j * rowH + rowH / 2;
    if (j) s += `<line x1="8" y1="${T + j * rowH}" x2="${W - R}" y2="${T + j * rowH}" stroke="${COLOR.grid}"/>`;
    s += text(10, y - 3, r.label, `class="row-label"`) + text(10, y + 11, r.sub, `class="row-tag"`);
    if (Number.isFinite(r.hr)) {
      s += `<g data-tip="${r.label}<br>HR ${fmt(r.hr)} (${fmt(r.lo)}–${fmt(r.hi)}) · P ${fmtP(r.p)}${Number.isFinite(r.truth) ? `<br>真值 HR ${fmt(r.truth)}` : ""}">`;
      s += `<line x1="${sx(r.lo)}" y1="${y}" x2="${sx(r.hi)}" y2="${y}" stroke="${COLOR.ink}" stroke-width="2" stroke-linecap="round"/>`;
      s += `<rect x="${sx(r.hr) - 4.5}" y="${y - 4.5}" width="9" height="9" rx="1.5" fill="${COLOR.ink}" stroke="${COLOR.surface}" stroke-width="1.5"/>`;
      s += `<rect x="${sx(r.lo)}" y="${y - 8}" width="${Math.max(sx(r.hi) - sx(r.lo), 10)}" height="16" fill="transparent"/></g>`;
    }
    if (Number.isFinite(r.truth)) {
      const tx = sx(r.truth);
      s += `<path d="M${tx},${y - 6}L${tx + 6},${y}L${tx},${y + 6}L${tx - 6},${y}Z" fill="none" stroke="${COLOR.muted}" stroke-width="1.6" data-tip="${r.label} · 真值 HR ${fmt(r.truth)}"/>`;
    }
  });
  return s + "</svg>";
}
