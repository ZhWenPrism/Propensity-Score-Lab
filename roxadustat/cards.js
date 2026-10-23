"use strict";

// Evidence cards (Board 1): each card = title + one-line lead + a chart drawn from verified
// numbers + the cited PDF crop. Card data: briefs.js (built from tools/briefs/*.json).
// Uses esc/srcPop/DOCS from app.js and data.js at call time.

const THEMES = {
  context: "背景与需求", design: "研究与人群", efficacy: "疗效", dropout: "停药与分析口径",
  cv: "心血管安全", thrombo: "血栓栓塞", other: "其他安全性"
};
const POP = { NDD: "非透析", DD: "透析", HD: "血液透析", PD: "腹膜透析", 混合: "混合人群" };

const num = s => parseFloat(String(s).replace(/,/g, "").replace(/[−–]/g, "-"));
const shown = s => String(s).replace(/^-/, "−");

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || mag * 10;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step);
  return out;
}

// ---- viz renderers ----------------------------------------------------------
function vizPair(v, ag) {
  const vals = v.rows.flatMap(r => [num(r.r), num(r.c)]).filter(Number.isFinite);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals) || 1;
  const span = (hi - lo) * 1.04 || 1, pos = x => ((x - lo) / span) * 100, zero = pos(0);
  const bar = (val, cls, count, arm) => {
    const x = num(val);
    if (!Number.isFinite(x)) return `<div class="pbar"><span class="pna">${esc(val)}</span></div>`;
    const a = Math.min(pos(x), zero), w = Math.abs(pos(x) - zero);
    return `<div class="pbar" data-tip="${esc(`${arm}：${shown(val)} ${v.unit || ""}${count ? `（${count}）` : ""}`)}">
      <i class="${cls}${x < 0 ? " neg" : ""}" style="left:${a}%;width:${Math.max(w, 0.6)}%"></i>
      <span class="pval${x < 0 ? " neg" : ""}" style="left:${x < 0 ? a : a + w}%">${esc(shown(val))}${count ? `<small>${esc(count)}</small>` : ""}</span></div>`;
  };
  return `<div class="viz-legend"><span><i class="sw ${ag}"></i>${esc(v.arms[0])}</span><span><i class="sw ctrl"></i>${esc(v.arms[1])}</span>${v.unit ? `<span class="unit">单位：${esc(v.unit)}</span>` : ""}</div>
    <div class="pairs${lo < 0 ? " has-neg" : ""}${v.rows.some(r => r.rn || r.cn) ? " has-count" : ""}" style="--zero:${zero}%">${v.rows.map(r => `<div class="prow">
      <div class="pk">${esc(r.k)}${r.note ? `<small>${esc(r.note)}</small>` : ""}</div>
      <div class="pbars">${bar(r.r, ag, r.rn, v.arms[0])}${bar(r.c, "ctrl", r.cn, v.arms[1])}</div></div>`).join("")}</div>`;
}

function vizForest(v, ag) {
  const log = v.scale === "log", ref = num(v.ref ?? (log ? 1 : 0)), margin = v.margin != null ? num(v.margin) : null;
  const pts = v.rows.flatMap(r => [num(r.lo), num(r.hi), num(r.est)]).concat([ref], margin != null ? [margin] : []).filter(Number.isFinite);
  let lo = Math.min(...pts), hi = Math.max(...pts), pos, ticks;
  if (log) {
    lo = Math.min(lo, 0.8) / 1.06; hi = Math.max(hi, 1.25) * 1.06;
    pos = x => ((Math.log(x) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * 100;
    ticks = [0.25, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4].filter(t => t >= lo && t <= hi);
  } else {
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    pos = x => ((x - lo) / (hi - lo)) * 100;
    ticks = niceTicks(lo, hi);
  }
  const refs = `<i class="ref" style="left:${pos(ref)}%"></i>${margin != null ? `<i class="ref margin" style="left:${pos(margin)}%"></i>` : ""}`;
  const rows = v.rows.map(r => {
    const e = num(r.est), l = num(r.lo), h = num(r.hi);
    const ci = Number.isFinite(l) && Number.isFinite(h) ? `<i class="ci ${ag}" style="left:${pos(l)}%;width:${pos(h) - pos(l)}%"></i>` : "";
    const ciText = Number.isFinite(l) ? `${shown(r.lo)} – ${shown(r.hi)}` : "";
    return `<div class="frow" data-tip="${esc(`${r.k}<br>${shown(r.est)}${ciText ? `（${ciText}）` : ""}${r.sub ? `<br>${r.sub}` : ""}`)}">
      <span class="flabel"><span><b>${esc(r.k)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span></span>
      <span class="track">${refs}${ci}${Number.isFinite(e) ? `<i class="pt ${ag}" style="left:${pos(e)}%"></i>` : ""}</span>
      <span class="fval">${esc(shown(r.est))}<small>${esc(ciText)}</small></span></div>`;
  }).join("");
  const fmt = t => (log ? t : shown(+t.toFixed(4)));
  const axis = `<div class="faxis"><span></span><span class="ticks">${ticks.map(t => `<span style="left:${pos(t)}%">${fmt(t)}</span>`).join("")}</span><span class="axis-name"></span></div>`;
  const legend = `<div class="legend"><span>${esc(v.axis || (log ? "HR" : "差值"))}</span>${margin != null ? `<span><i class="ref-key margin"></i>${esc(v.marginLabel || "界值")} ${shown(v.margin)}</span>` : ""}<span><i class="ref-key"></i>${log ? "HR = 1（无差别）" : "0（无差别）"}</span></div>`;
  return `<div class="forest card-forest">${rows}${axis}</div>${legend}`;
}

function vizStats(v) {
  return `<div class="stat-tiles">${v.items.map(s => `<div class="tile"><strong>${esc(s.v)}</strong><span>${esc(s.k)}</span>${s.sub ? `<small>${esc(s.sub)}</small>` : ""}</div>`).join("")}</div>`;
}

function vizTrials(v, ag) {
  const max = Math.max(...v.rows.map(r => num(r.n)).filter(Number.isFinite), 1);
  const groups = [...new Set(v.rows.map(r => r.pop))];
  return `<div class="trials">${groups.map(g => `<div class="tgroup"><div class="tg-head">${esc(POP[g] || g)}</div>
    ${v.rows.filter(r => r.pop === g).map(r => `<div class="trow" data-tip="${esc(`${r.id}<br>对照：${r.comp}<br>${r.design || ""}<br>n = ${r.n}`)}">
      <span class="tid">${esc(r.id)}</span>
      <span class="tmeta">${esc(r.comp)}${r.design ? ` · ${esc(r.design)}` : ""}</span>
      <span class="tbar"><i class="${ag}" style="width:${Number.isFinite(num(r.n)) ? (num(r.n) / max) * 100 : 0}%"></i></span>
      <span class="tn">${esc(r.n)}</span></div>`).join("")}</div>`).join("")}
    <div class="legend"><span>条形长度 = 随机化（或入组）人数</span></div></div>`;
}

// First part in the agency colour, the second in the comparator grey, then lighter tints.
const PART_FILL = ag => [`var(--${ag})`, "var(--ctrl)", `color-mix(in srgb,var(--${ag}) 45%,var(--panel))`, "var(--line-strong)", `color-mix(in srgb,var(--${ag}) 20%,var(--panel))`];
function vizSplit(v, ag) {
  const fill = PART_FILL(ag);
  return `<div class="splits">${v.rows.map(r => {
    const total = r.parts.reduce((s, p) => s + (num(p.v) || 0), 0) || 1;
    return `<div class="srow"><div class="sk">${esc(r.k)}</div>
      <div class="sbar">${r.parts.map((p, i) => `<i style="width:${(num(p.v) / total) * 100}%;background:${fill[i % fill.length]}" data-tip="${esc(`${p.k}：${p.v} ${v.unit || ""}`)}"></i>`).join("")}</div>
      <div class="skeys">${r.parts.map((p, i) => `<span><i class="sw" style="background:${fill[i % fill.length]}"></i>${esc(p.k)} <b>${esc(p.v)}</b></span>`).join("")}</div></div>`;
  }).join("")}</div>`;
}

// A cell that is just a number or a percentage (optionally "n（x%）") gets a small in-cell bar;
// all such cells in one table share one scale.
const cellValue = c => {
  const m = String(c).trim().match(/^-?\d[\d,]*(?:\.\d+)?\s*%?$|^\d+\s*[（(]\s*(\d+(?:\.\d+)?)\s*%\s*[)）]$/);
  return m ? (m[1] ? num(m[1]) : num(m[0])) : null;
};
function vizTable(v, ag) {
  const vals = v.rows.flatMap(r => r.cells.slice(1).map(cellValue)).filter(x => x != null && x >= 0);
  const max = vals.length >= 3 ? Math.max(...vals) : 0;
  const cell = (c, i) => {
    if (!i) return `<td>${esc(c)}</td>`;
    const x = cellValue(c);
    return `<td class="num">${esc(c)}${max && x != null && x >= 0 ? `<span class="cbar"><i class="${ag}" style="width:${(x / max) * 100}%"></i></span>` : ""}</td>`;
  };
  return `<div class="table-wrap"><table class="effects"><thead><tr>${v.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
    ${v.rows.map(r => `<tr>${r.cells.map(cell).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function vizQuote(v) {
  return `<ul class="qlist">${v.items.map(q => `<li><details><summary>${esc(q.zh)}</summary>
    <blockquote>${esc(q.src[0][2])}<cite>${esc(DOCS[q.src[0][0]].label)} p.${q.src[0][1]}</cite></blockquote></details></li>`).join("")}</ul>`;
}

const VIZ = { pair: vizPair, forest: vizForest, stats: vizStats, trials: vizTrials, split: vizSplit, table: vizTable, quote: vizQuote };

// ---- card + package ---------------------------------------------------------
function cardSources(card) {
  const rows = card.viz.rows || card.viz.items || [];
  const byPage = new Map();
  for (const [d, p, s] of rows.flatMap(r => r.src || []).concat(card.extra || [])) {
    const k = `${d}|${p}`;
    if (!byPage.has(k)) byPage.set(k, { d, p, snips: [] });
    if (!byPage.get(k).snips.includes(s)) byPage.get(k).snips.push(s);
  }
  return [...byPage.values()];
}

function renderCard(card, ag, i, n) {
  const read = !!(state.read || {})[card.id];
  const open = !!(state.shotOpen || {})[card.id];
  const shots = open ? `<div class="shots">${card.shots.map(s => `<figure class="shot">
      <button type="button" class="shot-img" data-full="${s.full}" data-doc="${s.doc}" data-page="${s.page}" aria-label="放大查看整页">
        <img src="${s.crop}" alt="${esc(`${DOCS[s.doc].label} 第 ${s.page} 页摘录`)}" width="${s.w}" height="${s.h}" loading="lazy"></button>
      <figcaption>${esc(DOCS[s.doc].label)} 第 ${s.page} 页 · <button type="button" class="linkish" data-full="${s.full}" data-doc="${s.doc}" data-page="${s.page}">看整页</button>${DOCS[s.doc].url ? ` · ${pdfLink(s.doc, s.page, "打开 PDF")}` : ""}</figcaption>
    </figure>`).join("")}</div>` : "";
  return `<article class="ecard${read ? " is-read" : ""}" id="card-${card.id}">
    <div class="ec-top"><span class="ec-theme">${esc(THEMES[card.theme])}</span><span class="ec-count">${i + 1} / ${n}</span></div>
    <h4>${esc(card.title)}</h4>
    <p class="ec-lead">${esc(card.lead)}</p>
    <div class="ec-viz">${VIZ[card.viz.type](card.viz, ag)}</div>
    <div class="ec-foot">
      <span class="src">${cardSources(card).map(g => srcPop(g.d, g.p, g.snips)).join("")}</span>
      <span class="ec-actions">
        <button type="button" class="btn small" data-shot="${card.id}" aria-expanded="${open}">${open ? "收起原文截图" : "看原文截图"}</button>
        <button type="button" class="btn small read-btn" data-read="${card.id}" aria-pressed="${read}">${read ? "已读" : "标为已读"}</button>
      </span>
    </div>${shots}
  </article>`;
}

function renderBriefs() {
  const box = $("package");
  if (!state.agency) { box.hidden = true; return; }
  const ag = pkgAgency(), cards = BRIEFS[ag] || [], pk = PACKAGES[ag];
  if (!cards.length) { box.hidden = false; box.innerHTML = `<p class="sub" style="margin:0">这家机构的证据卡还没有生成。</p>`; return; }
  const readN = cards.filter(c => (state.read || {})[c.id]).length;
  const docs = new Set(cards.flatMap(c => c.shots.map(s => s.doc)));
  const pages = new Set(cards.flatMap(c => c.shots.map(s => `${s.doc}|${s.page}`)));
  const themes = Object.keys(THEMES).filter(t => cards.some(c => c.theme === t));
  box.hidden = false;
  box.innerHTML = `<div class="pkg-head">
      <h3><span class="agency-tag"><span class="dot ${ag}"></span>${AGENCIES[ag].short}</span> 的证据包</h3>
      <p class="pkg-headline">${esc(pk.headline)}</p>
      <div class="pkg-meta"><span><b>${cards.length}</b> 张证据卡</span><span><b>${docs.size}</b> 份审评文件</span><span><b>${pages.size}</b> 页原文</span>
        <span class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${cards.length}" aria-valuenow="${readN}" aria-label="已读进度"><i style="width:${(readN / cards.length) * 100}%"></i></span><span>已读 ${readN} / ${cards.length}</span></div>
      ${pk.missing ? `<div class="missing"><strong>当时还没有：</strong>${esc(pk.missing)}</div>` : ""}
    </div>
    <div class="brief-grid">
      <nav class="brief-toc" aria-label="证据卡目录">${themes.map(t => {
        const list = cards.filter(c => c.theme === t);
        return `<div class="toc-group"><a class="toc-theme" href="#card-${list[0].id}">${esc(THEMES[t])}<span>${list.length}</span></a>
          ${list.map(c => `<a class="toc-card${(state.read || {})[c.id] ? " is-read" : ""}" href="#card-${c.id}">${esc(c.title)}</a>`).join("")}</div>`;
      }).join("")}</nav>
      <div class="brief-feed">${cards.map((c, i) => renderCard(c, ag, i, cards.length)).join("")}</div>
    </div>`;
}

// ---- lightbox ---------------------------------------------------------------
function openLightbox(full, doc, page) {
  const lb = $("lightbox");
  lb.innerHTML = `<div class="lb-bar"><span>${esc(DOCS[doc].label)} 第 ${page} 页</span><span>${DOCS[doc].url ? pdfLink(doc, page, "打开 PDF") : "CDE 文件：本地 原始文件/中国/"}<button type="button" class="lb-close" aria-label="关闭">关闭</button></span></div>
    <div class="lb-body"><img src="${full}" alt="${esc(`${DOCS[doc].label} 第 ${page} 页整页`)}"></div>`;
  lb.hidden = false;
  document.body.classList.add("lb-open");
  lb.querySelector(".lb-close").focus();
}
function closeLightbox() {
  $("lightbox").hidden = true;
  document.body.classList.remove("lb-open");
}
