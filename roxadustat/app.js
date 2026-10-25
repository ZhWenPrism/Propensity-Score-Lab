"use strict";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f2 = x => (Number.isFinite(x) ? x.toFixed(2) : "—");


const STORE_KEY = "roxa-bra-v2";
const state = Object.assign({
  agency: null, pop: "ndd", nddPick: null, ddPick: null, include613: false, split: false,
  read: {}, shotOpen: {}, decisions: {}, revealed: false, debateStep: 1, debateAll: false,
  attr: {}, attrChecked: false, viewAgency: null, weight: 20,
  sim: { trueHR: 1.0, dropPlaHigh: 0.85, postMult: 1.0, seed: 1 }
}, (() => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } })());
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } };
const allMode = () => state.revealed;

// ---- sources: chips + popover ---------------------------------------------
const REG = [];
const srcChips = src => {
  if (!src || !src.length) return "";
  return `<span class="src">${src.map(([d, p, s]) => {
    REG.push({ d, p, s });
    return `<button type="button" data-ref="${REG.length - 1}" aria-label="查看出处 ${esc(DOCS[d].label)} 第 ${p} 页">${esc(DOCS[d].label)} p.${p}</button>`;
  }).join("")}</span>`;
};
// One chip per cited page; the popover lists every snippet the card took from it.
const srcPop = (d, p, snips) => {
  REG.push({ d, p, s: snips });
  return `<button type="button" data-ref="${REG.length - 1}" aria-label="查看出处 ${esc(DOCS[d].label)} 第 ${p} 页">${esc(DOCS[d].label)} p.${p}</button>`;
};
const pdfLink = (d, p, text) => (DOCS[d].url ? `<a href="${DOCS[d].url}#page=${p}" target="_blank" rel="noopener">${text}</a>` : "");
const quoteBlock = q => (q ? `<blockquote>${esc(q.t)}<cite>${esc(DOCS[q.d].label)} p.${q.p}${DOCS[q.d].url ? ` · ${pdfLink(q.d, q.p, "打开原文")}` : ""}</cite></blockquote>` : "");

const pop = $("popover");
document.addEventListener("click", e => {
  const b = e.target.closest("[data-ref]");
  if (b) {
    const r = REG[Number(b.dataset.ref)];
    pop.innerHTML = `<div class="doc">${esc(DOCS[r.d].label)} · 第 ${r.p} 页</div>${[].concat(r.s).map(s => `<div class="snip">${esc(s)}</div>`).join("")}<div class="links"><span></span><span>${DOCS[r.d].url ? pdfLink(r.d, r.p, "打开 PDF") : "本地文件：原始文件/中国/"}</span></div>`;
    pop.hidden = false;
    const box = b.getBoundingClientRect(), w = Math.min(420, window.innerWidth - 24);
    pop.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - w - 12))}px`;
    pop.style.top = `${Math.min(box.bottom + 8, window.innerHeight - pop.offsetHeight - 12)}px`;
    e.stopPropagation();
    return;
  }
  if (!e.target.closest("#popover")) pop.hidden = true;
});
document.addEventListener("keydown", e => { if (e.key === "Escape") { pop.hidden = true; closeLightbox(); } });

const tip = $("tooltip");
document.addEventListener("mousemove", e => {
  const t = e.target.closest("[data-tip]");
  if (!t) { tip.hidden = true; return; }
  tip.innerHTML = t.dataset.tip;
  tip.hidden = false;
  tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 10)}px`;
  tip.style.top = `${Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 10)}px`;
});

// ---- forest plot (HTML positioned, readable at any width) -----------------
function forest(rows, { refs = [{ x: 1 }], truth = null, pick = null, clickable = true } = {}) {
  const vals = rows.flatMap(r => [r.lo, r.hi]).concat(refs.map(r => r.x), truth ? [truth] : []);
  const lo = Math.min(0.7, ...vals) / 1.05, hi = Math.max(1.5, ...vals) * 1.05;
  const pos = v => ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * 100;
  const ticks = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5].filter(t => t >= lo && t <= hi);
  const refLines = refs.map(r => `<i class="ref${r.dashed ? " margin" : ""}" style="left:${pos(r.x)}%"></i>`).join("")
    + (truth ? `<i class="ref truth" style="left:${pos(truth)}%"></i>` : "");
  const body = rows.map(r => {
    const tag = clickable ? "button" : "div";
    const attrs = clickable ? `type="button" data-pick="${r.id}" aria-pressed="${pick === r.id}"` : "";
    return `<${tag} class="frow" ${attrs} data-tip="${esc(`${r.label}<br>HR ${f2(r.hr)}（${f2(r.lo)}–${f2(r.hi)}）${r.role ? `<br>${r.role}` : ""}`)}">
      <span class="flabel">${r.agency ? `<span class="dot ${r.agency}"></span>` : ""}<span><b>${esc(r.label)}</b>${r.role ? `<small>${esc(r.role)}</small>` : ""}</span></span>
      <span class="track">${refLines}<i class="ci ${r.agency || "neutral"}" style="left:${pos(r.lo)}%;width:${pos(r.hi) - pos(r.lo)}%"></i><i class="pt ${r.agency || "neutral"}" style="left:${pos(r.hr)}%"></i></span>
      <span class="fval">${f2(r.hr)}<small>${f2(r.lo)}–${f2(r.hi)}</small></span>
    </${tag}>`;
  }).join("");
  const axis = `<div class="faxis"><span></span><span class="ticks">${ticks.map(t => `<span style="left:${pos(t)}%">${t}</span>`).join("")}</span><span class="axis-name">HR</span></div>`;
  const refLegend = refs.filter(r => r.label).map(r => `<span><i class="ref-key${r.dashed ? " margin" : ""}"></i>${esc(r.label)}</span>`).join("")
    + (truth ? `<span><i class="ref-key truth"></i>模拟设定的真实 HR</span>` : "");
  return `<div class="forest">${body}${axis}</div>${refLegend ? `<div class="legend">${refLegend}</div>` : ""}`;
}

// ---- Board 1 --------------------------------------------------------------
function renderAgencyCards() {
  const box = $("agency-cards");
  if (!state.agency) {
    box.innerHTML = `<div class="me-card"><div><b>还没有选择机构</b><span>先选择你们组扮演哪家监管机构。</span></div><button class="btn primary" type="button" id="reopen-draw">去选择</button></div>`;
    $("me-tag").textContent = "尚未选择机构";
    return;
  }
  const a = AGENCIES[state.agency];
  const shown = pkgAgency();
  const others = state.revealed ? `<div class="agency-tabs pkg-tabs" role="tablist" aria-label="查看各机构的证据包">${AGENCY_ORDER.map(k => `<button type="button" role="tab" data-pkg="${k}" aria-selected="${k === shown}"><span class="dot ${k}"></span>${AGENCIES[k].short} 的证据包${k === state.agency ? "（你们）" : ""}</button>`).join("")}</div>` : "";
  box.innerHTML = `<div class="me-card"><span class="agency-tag"><span class="dot ${state.agency}"></span>${a.short}</span><div><b>你们组扮演：${esc(a.name)}</b><span>决策节点 ${a.when}（${esc(a.whenLabel)}）。${state.revealed ? "已揭晓，现在可以翻看其他机构的证据包。" : "揭晓前只能看本机构的证据。"}</span></div></div>${others}`;
  $("me-tag").innerHTML = `<span class="dot ${state.agency}"></span>你们是：${a.short} · ${a.when}`;
}
const pkgAgency = () => (state.revealed && state.pkgAgency) || state.agency;

// ---- Board 2: workbench ------------------------------------------------------
const analysesFor = pop => {
  const all = pop === "ndd" ? NDD_ANALYSES : DD_ANALYSES;
  if (allMode()) {
    return pop === "ndd" ? all : all.filter(r => r.group === "base" || (r.group === "s613" && state.include613) || (r.group === "split" && state.split));
  }
  const ids = (WORKBENCH[state.agency] || {})[pop] || [];
  return ids.map(id => all.find(r => r.id === id));
};

function renderWorkbench() {
  const ag = state.agency;
  const custom = !allMode() && (ag === "nmpa" || ag === "pmda");
  $("pop-tabs").hidden = custom || (!ag && !allMode());
  $("all-banner").hidden = !allMode();
  if (!ag && !allMode()) {
    $("mace-panel").innerHTML = `<p class="sub" style="margin:0">先在第 1 步拿到你们的证据包。</p>`;
    $("effects-panel").hidden = true;
    return;
  }
  $("effects-panel").hidden = false;
  if (custom) { (ag === "nmpa" ? renderNmpa : renderPmda)(); return; }
  renderMace();
  renderEffects();
}

function renderMace() {
  const panel = $("mace-panel"), ndd = state.pop === "ndd";
  const rows = analysesFor(state.pop);
  const head = ndd
    ? `<h3>心血管安全（MACE）：选一个作为主要依据</h3><p class="sub">非透析，对照安慰剂。点击一行选为你们的主要分析。</p>`
    : `<h3>心血管安全（MACE）：透析人群，对照 ESA</h3><p class="sub">点击一行选为你们的主要依据。</p>`;
  const pickId = ndd ? state.nddPick : state.ddPick;
  const pick = rows.find(r => r.id === pickId);
  const toggles = !ndd && allMode() ? `<div class="toggles">
      <label class="switch"><input type="checkbox" id="t-613" ${state.include613 ? "checked" : ""}>纳入 613（EMA 的做法）</label>
      <label class="switch"><input type="checkbox" id="t-split" ${state.split ? "checked" : ""}>按"转换 / 校正"拆分（EMA 的做法）</label></div>` : "";
  const refs = ndd && (allMode() || state.agency === "ema") ? [{ x: 1 }, { x: 1.3, dashed: true, label: "EMA 采用的 1.3 界值（因 ESA 已知心血管风险而取更严）" }] : [{ x: 1 }];
  panel.innerHTML = head + toggles + forest(rows, { refs, pick: pickId })
    + (pick ? `<div class="pick-note"><strong>${esc(pick.label)}</strong>（${esc(pick.role)}）${pick.what ? `：${esc(pick.what)}` : ""}${pick.events ? `。事件：${esc(pick.events)}` : ""}${srcChips(pick.src)}</div>`
      : `<div class="pick-note">还没有选择。${ndd ? "想一想：两组停药比例差这么多时，停药后发生的事件该不该算？" : "想一想：主要分析和敏感性分析不一致时，你更信哪一个？"}</div>`)
    + (ndd ? simExplainer() : "");
  if (ndd) renderSim();
}

function simExplainer() {
  return `<details class="explain" id="sim-box" ${state.simOpen ? "open" : ""}><summary>原理演示：为什么停药多的时候，两种计数窗口会给出不同的 HR？</summary>
    <div class="explain-body">
      <p class="sub">模拟 10 个两组各 3,000 人的试验：30% 是高风险患者。高风险患者在安慰剂组更容易因为贫血没改善而停药。你可以设定"真实"的 HR，看三种分析各算出多少。</p>
      <div class="preset-row">
        <button class="btn" type="button" data-preset="fda">情形 A：真实无差别</button>
        <button class="btn" type="button" data-preset="ema">情形 B：真实有风险，停药后改用 ESA</button>
        <button class="btn" type="button" data-preset="equal">两组停药一样</button>
        <button class="btn" type="button" data-preset="reseed">重新模拟</button>
      </div>
      <div class="sim-grid">
        <div>
          <div class="slider"><label for="s-hr">真实 HR（研究药物的作用）<output id="o-hr"></output></label><input type="range" id="s-hr" min="0.7" max="1.6" step="0.05"></div>
          <div class="slider"><label for="s-drop">安慰剂组高风险患者停药比例<output id="o-drop"></output></label><input type="range" id="s-drop" min="0.3" max="0.95" step="0.05"></div>
          <div class="slider"><label for="s-post">停药后的风险倍数（如改用 ESA）<output id="o-post"></output></label><input type="range" id="s-post" min="0.6" max="2" step="0.1"></div>
          <div class="sim-stats" id="sim-stats"></div>
        </div>
        <div><div id="sim-forest"></div><p class="sim-read" id="sim-read"></p></div>
      </div>
    </div></details>`;
}

const SIM_PRESETS = {
  fda: { trueHR: 1.0, dropPlaHigh: 0.85, postMult: 1.0 },
  ema: { trueHR: 1.3, dropPlaHigh: 0.85, postMult: 1.5 },
  equal: { trueHR: 1.0, dropPlaHigh: 0.4, postMult: 1.0 }
};

function renderSim() {
  if (!$("s-hr")) return;
  const s = state.sim;
  $("s-hr").value = s.trueHR; $("s-drop").value = s.dropPlaHigh; $("s-post").value = s.postMult;
  $("o-hr").textContent = s.trueHR.toFixed(2); $("o-drop").textContent = `${Math.round(s.dropPlaHigh * 100)}%`; $("o-post").textContent = `×${s.postMult.toFixed(1)}`;
  const equal = s.dropPlaHigh <= 0.4 + 1e-9;
  const p = { trueHR: s.trueHR, dropPlaHigh: s.dropPlaHigh, postMult: s.postMult };
  if (equal) Object.assign(p, { dropPlaLow: 0.4, dropRoxHigh: 0.4, dropRoxLow: 0.4 });
  const r = simulateMany(p, s.seed);
  const rows = [
    { id: "a", label: "On-study", role: "停药后继续计数", ...r.onStudy },
    { id: "b", label: "OT+7", role: "停药 7 天后不再计数", ...r.ot7 },
    { id: "c", label: "OT+7 · 按风险分组校正", role: "按驱动停药的因素校正（IPCW 的思路）", ...r.ot7Strat }
  ];
  $("sim-forest").innerHTML = forest(rows, { truth: s.trueHR, clickable: false }) + `<p class="sub" style="margin:6px 0 0">点：${r.reps} 个模拟试验的平均；线：这 ${r.reps} 个试验结果的范围（不是置信区间）。</p>`;
  $("sim-stats").innerHTML = `<div class="stat"><span>完成率 · 研究药物</span><strong>${Math.round(r.completion.rox * 100)}%</strong></div><div class="stat"><span>完成率 · 安慰剂</span><strong>${Math.round(r.completion.pla * 100)}%</strong></div>`;
  const judge = x => { const d = Math.log(x.hr / s.trueHR); return d > 0.08 ? "偏高" : d < -0.08 ? "偏低" : "接近真实值"; };
  $("sim-read").innerHTML = `平均来看：On-study ${f2(r.onStudy.hr)}（${judge(r.onStudy)}），OT+7 ${f2(r.ot7.hr)}（${judge(r.ot7)}），校正后 ${f2(r.ot7Strat.hr)}（${judge(r.ot7Strat)}）。`
    + (equal ? "两组停药一样时，三种分析都应接近真实值。" : "OT+7 提前把安慰剂组的高风险患者移出了观察，安慰剂看起来更安全；On-study 继续计数，但停药后的事件已不是研究药物造成的，停药后风险越高，真实效应被稀释得越多。只有掌握了驱动停药的因素，才能校正。");
}

function effectsFor() {
  if (allMode()) return EFFECTS[state.pop];
  if (state.agency === "fda") return FDA_EFFECTS[state.pop];
  const e = EFFECTS[state.pop];
  return { ...e, unfavourable: e.unfavourable.filter(r => r.by === "ema") };
}

function weightRead(B, R, X) {
  const eq = B / X;
  return `按你们的权重，获益约等于避免 <b>${eq.toFixed(1)}</b> 次 MACE，对比多出的 <b>${R.toFixed(0)}</b> 次：${eq > R * 1.02 ? "获益一侧更重" : eq < R * 0.98 ? "风险一侧更重" : "两边相当"}。`;
}

// Effects table as dumbbells: one row per effect, roxadustat (filled) vs comparator (hollow),
// rows sharing a unit share an axis.
function dumbbells(e, roxCls, control) {
  const unitOf = r => (String(r.r).match(/(%|g\/dL|g\/L|mg)\s*$/) || [])[1] || r.unit || "";
  const unitName = u => ({ "%": "比例（%）", "/100 人年": "每 100 人年" }[u] || u);
  const textRow = r => `<div class="db-row"><span class="db-k">${r.by ? `<span class="dot ${r.by}"></span>` : ""}${esc(r.k)}</span><span class="db-text">${esc(r.r)}${r.c ? ` · ${esc(control)} ${esc(r.c)}` : ""}</span><span></span></div>`;
  const section = (title, rows) => {
    const groups = new Map();
    rows.forEach(r => { const u = unitOf(r); if (!groups.has(u)) groups.set(u, []); groups.get(u).push(r); });
    return `<div class="db-section"><div class="db-title">${title}</div>${[...groups].map(([u, rs]) => {
      const vals = rs.flatMap(r => [num(r.r), num(r.c)]).filter(Number.isFinite);
      const max = (Math.max(...vals, 0) || 1) * 1.08, pos = x => (x / max) * 100;
      return `${vals.length ? `<div class="db-unit">${esc(unitName(u))}</div>` : ""}${rs.map(r => {
        const a = num(r.r), b = num(r.c);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return textRow(r);
        return `<div class="db-row" data-tip="${esc(`${r.k}<br>罗沙司他 ${r.r} · ${control} ${r.c}${r.unit ? ` ${r.unit}` : ""}`)}">
          <span class="db-k">${r.by ? `<span class="dot ${r.by}"></span>` : ""}${esc(r.k)}${r.overlap ? "<small>死亡已包含在 MACE 中，不要重复计算</small>" : ""}</span>
          <span class="db-track"><i class="db-line" style="left:${pos(Math.min(a, b))}%;width:${Math.abs(pos(a) - pos(b))}%"></i><i class="db-c" style="left:${pos(b)}%"></i><i class="db-r ${roxCls}" style="left:${pos(a)}%"></i></span>
          <span class="db-v"><b>${esc(r.r)}</b> vs ${esc(r.c)}</span></div>`;
      }).join("")}`;
    }).join("")}</div>`;
  };
  return `<div class="viz-legend"><span><i class="db-key r ${roxCls}"></i>罗沙司他</span><span><i class="db-key c"></i>${esc(control)}</span><span class="unit">同一单位的行共用一条轴</span></div>
    <div class="dumb">${section("获益（favourable）", e.favourable)}${section("风险（unfavourable）", e.unfavourable)}</div>`;
}

function renderEffects() {
  const panel = $("effects-panel");
  const e = effectsFor();
  const control = state.pop === "ndd" ? "安慰剂" : "ESA";
  const diff = r => (r.per ? `${Number(r.r) - Number(r.c) > 0 ? "+" : "−"}${Math.abs((Number(r.r) - Number(r.c)) * 10).toFixed(0)}` : "—");
  const row = r => `<tr><td>${r.by ? `<span class="dot ${r.by}"></span> ` : ""}${esc(r.k)}${r.overlap ? "<br><small style='color:var(--muted)'>死亡已包含在 MACE 中，不要重复计算</small>" : ""}</td><td class="num">${esc(r.r)}</td><td class="num">${esc(r.c)}</td><td class="num">${esc(r.unit)}</td><td class="num">${diff(r)}</td><td>${srcChips(r.src)}</td></tr>`;
  const legend = allMode() ? `<div class="legend"><span><span class="dot ema"></span>EMA 效应表</span><span><span class="dot fda"></span>FDA 严重不良事件表</span></div>` : "";
  const table = `<div class="table-wrap"><table class="effects"><thead><tr><th>指标</th><th>罗沙司他</th><th>${control}</th><th>单位</th><th>差值 / 1000 人年</th><th>出处</th></tr></thead><tbody>
    <tr class="group"><td colspan="6">获益（favourable）</td></tr>${e.favourable.map(row).join("")}
    <tr class="group"><td colspan="6">风险（unfavourable）</td></tr>${e.unfavourable.map(row).join("")}
  </tbody></table></div>${legend}`;
  const risks = e.unfavourable.filter(r => r.per && !r.overlap).map(r => ({ k: r.k, d: (Number(r.r) - Number(r.c)) * 10, by: r.by }));
  const maxD = Math.max(...risks.map(r => r.d), 1);
  const bars = `<div class="bars">${risks.map(r => `<div class="brow" data-tip="${esc(`${r.k}<br>每 1000 人年差 ${r.d.toFixed(0)} 例`)}"><span class="blabel">${esc(r.k)}</span><span class="btrack"><i class="${r.by}" style="width:${Math.max(0, r.d) / maxD * 100}%"></i></span><span class="bval">${r.d >= 0 ? "+" : "−"}${Math.abs(r.d).toFixed(0)}</span></div>`).join("")}</div>`;
  const barsBlock = `<div><h4 style="margin:0 0 6px;font-size:14px">风险：每 1000 人年多出的事件</h4>${bars}</div>`;
  let side;
  if (e.tradeoff && (allMode() || state.agency === "ema")) {
    const ben = e.favourable.find(r => r.k.startsWith(e.tradeoff.benefitKey)), risk = e.unfavourable.find(r => r.k === e.tradeoff.riskKey);
    const B = (Number(ben.c) - Number(ben.r)) * 10, R = (Number(risk.r) - Number(risk.c)) * 10, be = B / R, X = state.weight || 20;
    side = `<div class="breakeven">
        <div style="font-size:13px;color:var(--ink-2)">每 1000 人年少 <b>${B.toFixed(0)}</b> 次救援治疗，多 <b>${R.toFixed(0)}</b> 次 MACE</div>
        <div class="big">${be.toFixed(0)} : 1</div>
        <p>只看这两项：如果你认为 1 次 MACE 比 ${be.toFixed(0)} 次救援治疗更严重，风险就超过了获益。这个交换比没有标准答案，它就是"价值判断"。</p>
        <div class="slider" style="margin-top:10px"><label for="s-w">你们认为 1 次 MACE ≈ 多少次救援治疗<output id="o-w">${X}</output></label><input type="range" id="s-w" min="1" max="100" step="1" value="${X}" data-b="${B}" data-r="${R}"></div>
        <p id="w-read">${weightRead(B, R, X)}</p>
        <p>注意：救援治疗包括开始使用 ESA，而 ESA 本身就是现有的标准治疗。</p></div>`;
  } else {
    const text = e.tradeoffText || "对照是 ESA：Hb 相当，主要获益是口服和静脉铁更少，很难和事件率放在同一尺度上比较。讨论：这些获益值得承担左边这些额外事件吗？";
    side = `<div class="breakeven"><div class="big" style="font-size:22px">获益和风险能放在同一尺度吗？</div><p>${esc(text)}</p></div>`;
  }
  const roxCls = allMode() ? "" : state.agency;
  panel.innerHTML = `<h3>效应表：获益与风险放在一起看</h3><p class="sub">${esc(e.note)}${srcChips(e.noteSrc)}</p>${dumbbells(e, roxCls, control)}
    <details class="table-details"><summary>表格视图（含出处）</summary>${table}</details><div class="tradeoff">${barsBlock}${side}</div>`;
}

function renderNmpa() {
  const d = NMPA_PANEL;
  $("mace-panel").innerHTML = `<h3>心血管安全：说明书里的跨试验比较</h3>
    <p class="sub">${esc(d.compareNote.v)}${srcChips(d.compareNote.src)}。中国试验给的是"发生比例"，ESA 文献给的是"每 100 病人暴露年"。先把单位换成一样，再看能不能比。</p>
    <div class="tabs small" role="tablist" aria-label="人群" id="nmpa-pop">${[["0", "透析"], ["1", "非透析"]].map(([i, t]) => `<button type="button" role="tab" data-npop="${i}" aria-selected="${String(state.nmpaPop || 0) === i}">${t}</button>`).join("")}</div>
    <div class="sim-grid" style="margin-top:12px">
      <div>
        <div class="slider"><label for="s-yrs">中国试验罗沙司他组的平均用药时长<output id="o-yrs"></output></label><input type="range" id="s-yrs" min="0.25" max="1.5" step="0.05" value="${state.nmpaYears || 0.5}"></div>
        <p class="sub" style="margin:0">${esc(d.followup.v)}${srcChips(d.followup.src)}。主研究期 26 周约 0.5 年。</p>
        <p class="sub" style="margin:8px 0 0">换算：每 100 人年 ≈ 发生比例 ÷ 平均用药年数。</p>
      </div>
      <div id="nmpa-conv"></div>
    </div>
    <div class="questions"><h4>你们组先讨论</h4><ol>${d.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ol></div>`;
  renderNmpaConv();
  $("effects-panel").innerHTML = `<h3>说明书原表：表 6 与表 7</h3><p class="sub">左边两列是中国 II/III 期罗沙司他组的发生比例；右边两列是已发表 ESA 试验，每 100 病人暴露年。</p>
    <div class="table-wrap"><table class="effects"><thead><tr><th>心血管事件</th><th>中国试验 · 透析（%）</th><th>中国试验 · 非透析（%）</th><th>ESA 文献 · 透析（/100 PEY）</th><th>ESA 文献 · 非透析（/100 PEY）</th><th>出处</th></tr></thead><tbody>
      ${d.compare.map(r => `<tr><td>${esc(r.k)}</td><td class="num">${esc(r.cn[0])}</td><td class="num">${esc(r.cn[1])}</td><td class="num">${esc(r.esa[0])}</td><td class="num">${esc(r.esa[1])}</td><td>${srcChips(r.src)}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function renderNmpaConv() {
  const box = $("nmpa-conv");
  if (!box) return;
  const yrs = state.nmpaYears || 0.5, col = state.nmpaPop || 0;
  $("o-yrs").textContent = `${yrs.toFixed(2)} 年`;
  const rows = NMPA_PANEL.compare.map(r => ({ k: r.k, cnPct: num(r.cn[col]), cn: num(r.cn[col]) / yrs, esa: num(r.esa[col]) }));
  const max = Math.max(...rows.flatMap(r => [r.cn, r.esa, r.cnPct])) * 1.08, pos = x => (x / max) * 100;
  box.innerHTML = `<div class="viz-legend"><span><i class="db-key r" style="background:var(--nmpa)"></i>中国试验（换算后，/100 人年）</span><span><i class="db-key c"></i>ESA 文献（/100 PEY）</span><span><i class="db-key ghost"></i>换算前的百分比数字</span></div>
    ${rows.map(r => `<div class="db-row" data-tip="${esc(`${r.k}<br>中国试验 ${r.cnPct}% ÷ ${yrs.toFixed(2)} 年 ≈ ${r.cn.toFixed(1)} /100 人年<br>ESA 文献 ${r.esa} /100 PEY`)}">
      <span class="db-k">${esc(r.k)}</span>
      <span class="db-track"><i class="db-line" style="left:${pos(Math.min(r.cn, r.esa))}%;width:${Math.abs(pos(r.cn) - pos(r.esa))}%"></i><i class="db-ghost" style="left:${pos(r.cnPct)}%"></i><i class="db-c" style="left:${pos(r.esa)}%"></i><i class="db-r" style="left:${pos(r.cn)}%;background:var(--nmpa)"></i></span>
      <span class="db-v"><b>${r.cn.toFixed(1)}</b> vs ${r.esa}</span></div>`).join("")}`;
}

function renderPmda() {
  const d = PMDA_PANEL, ni = d.ni;
  const lo = -1.0, hi = 0.5, pos = v => ((v - lo) / (hi - lo)) * 100;
  const ticks = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5];
  $("mace-panel").innerHTML = `<h3>疗效：0307 对 darbepoetin alfa 的非劣效检验</h3><p class="sub">Hb 变化差值（罗沙司他 − DA），g/dL。${srcChips(ni.src)}</p>
    <div class="forest"><div class="frow" data-tip="差值 ${ni.diff} [${ni.lo}, ${ni.hi}]">
      <span class="flabel"><span class="dot pmda"></span><span><b>Hb 变化差值</b><small>第 18–24 周，PPS</small></span></span>
      <span class="track"><i class="ref margin" style="left:${pos(ni.margin)}%"></i><i class="ref" style="left:${pos(0)}%"></i><i class="ci pmda" style="left:${pos(ni.lo)}%;width:${pos(ni.hi) - pos(ni.lo)}%"></i><i class="pt pmda" style="left:${pos(ni.diff)}%"></i></span>
      <span class="fval">${ni.diff}<small>${ni.lo} – ${ni.hi}</small></span></div>
      <div class="faxis"><span></span><span class="ticks">${ticks.map(t => `<span style="left:${pos(t)}%">${t}</span>`).join("")}</span><span class="axis-name">g/dL</span></div></div>
    <div class="legend"><span><i class="ref-key margin"></i>非劣效界值 −0.75 g/dL</span></div>`;
  const pct = d.safety.filter(r => /%$/.test(r.r)), other = d.safety.filter(r => !/%$/.test(r.r));
  const viz = { type: "pair", unit: "%", arms: ["罗沙司他（n=150）", "DA（n=152）"], rows: pct.map(r => ({ k: r.k, r: r.r.replace("%", ""), c: r.c.replace("%", "") })) };
  $("effects-panel").innerHTML = `<h3>安全性：0307 随机比较（各约 150 人，24 周）</h3>
    <p class="sub">同一研究内的随机比较，对照是 darbepoetin alfa（DA）。${srcChips(pct.flatMap(r => r.src))}</p>
    ${vizPair(viz, "pmda")}
    ${other.map(r => `<p class="pick-note" style="margin-top:12px"><strong>${esc(r.k)}</strong>：罗沙司他 ${esc(r.r)}，DA ${esc(r.c)}${srcChips(r.src)}</p>`).join("")}
    <h4 style="margin:18px 0 8px;font-size:14px">汇总数据（血透研究合并，没有同期对照）</h4>
    <div class="stat-tiles">${d.pooled.map(r => `<div class="tile"><strong>${esc(r.v.split("（")[0].replace(/^罗沙司他汇总 /, ""))}</strong><span>${esc(r.k)}</span><small>${esc(r.v)}</small>${srcChips(r.src)}</div>`).join("")}</div>
    <div class="questions"><h4>你们组先讨论</h4><ol>${d.questions.map(q => `<li>${esc(q)}</li>`).join("")}</ol></div>`;
}

function renderDecisionForm() {
  const ag = state.agency;
  $("decision-sub").textContent = ag ? `以 ${AGENCIES[ag].short}（${AGENCIES[ag].when}）的身份作答。` : "请先在第 1 步拿到你们的机构。";
  const d = (ag && state.decisions[ag]) || {};
  const radios = name => Object.entries(DECISIONS).map(([k, v]) => `<label class="opt"><input type="radio" name="${name}" value="${k}" ${d[name] === k ? "checked" : ""}>${esc(v)}</label>`).join("");
  $("fs-ndd").innerHTML = `<legend>非透析（NDD）</legend>${ag === "pmda" ? `<p class="sub" style="margin:0 0 6px">PMDA 本次审评只涉及透析患者，NDD 可不答。</p>` : ""}${radios("ndd")}`;
  $("fs-dd").innerHTML = `<legend>透析（DD）</legend>${radios("dd")}`;
  $("fs-rm").innerHTML = `<legend>风险管理工具（可多选）</legend>${Object.entries(RISK_TOOLS).map(([k, v]) => `<label class="opt"><input type="checkbox" name="rm" value="${k}" ${(d.rm || []).includes(k) ? "checked" : ""}>${esc(v)}</label>`).join("")}`;
  $("reason").value = d.reason || "";
}

// ---- Board 3 --------------------------------------------------------------
function renderReveal() {
  $("reveal-gate").hidden = state.revealed;
  $("reveal").hidden = !state.revealed;
  if (!state.revealed) {
    const done = !!(state.agency && state.decisions[state.agency]);
    $("reveal-btn").disabled = !done;
    $("gate-msg").textContent = !state.agency ? "先选择机构，读证据包，再在第 2 步提交你们的结论。"
      : done ? "结论已提交。准备好了就揭晓四家机构的真实决定。" : "先在第 2 步提交你们的结论，再揭晓四家机构的真实决定。";
    return;
  }
  renderCompare(); renderOverview(); renderAgencyPanel(); renderDebate(); renderAttribution();
}

function renderCompare() {
  const ag = state.agency;
  if (!ag) { $("compare-panel").hidden = true; return; }
  $("compare-panel").hidden = false;
  const mine = state.decisions[ag] || {}, real = REVEAL[ag].choices;
  const label = (map, k) => (k ? map[k] || k : null);
  const nddName = id => (id ? NDD_ANALYSES.find(r => r.id === id)?.label : null);
  const line = (k, you, them, note) => {
    const same = you && them && you === them;
    const mark = !you ? "<span style='color:var(--muted)'>未作答</span>" : !them ? "" : same ? `<span class="match">一致</span>` : `<span class="differ">不同</span>`;
    return `<tr><th scope="row">${k}</th><td>${you ? esc(you) : "—"}</td><td>${them ? esc(them) : esc(note || "—")}</td><td>${mark}</td></tr>`;
  };
  const rmMine = (mine.rm || []).map(k => RISK_TOOLS[k]).join("、"), rmReal = real.rm.map(k => RISK_TOOLS[k]).join("、");
  $("compare-panel").innerHTML = `<h3>你们 vs ${AGENCIES[ag].short}</h3><p class="sub">${esc(AGENCIES[ag].verdict)}${srcChips(AGENCIES[ag].src)}</p>
    <div class="table-wrap"><table class="compare"><thead><tr><th></th><th>你们</th><th>${ag === "fda" ? "FDA 咨询委员会" : `${AGENCIES[ag].short} 实际`}</th><th></th></tr></thead><tbody>
      ${line("NDD 的主要分析", nddName(state.nddPick), nddName(real.ndd), "决策时没有这批数据")}
      ${line("NDD 结论", label(DECISIONS, mine.ndd), label(DECISIONS, real.decisionNdd), "本次审评未涉及")}
      ${line("DD 结论", label(DECISIONS, mine.dd), label(DECISIONS, real.decisionDd))}
      ${line("风险管理", rmMine || null, rmReal || null)}
    </tbody></table></div>${mine.reason ? `<p class="sub" style="margin-top:10px">你们的理由：${esc(mine.reason)}</p>` : ""}`;
}

// Swimlane timeline (one lane per agency on a shared date axis) + a one-glance decision grid.
function renderOverview() {
  const t0 = Date.parse("2018-07-01"), t1 = Date.parse("2021-10-01");
  const pos = d => ((Date.parse(d) - t0) / (t1 - t0)) * 100;
  const years = ["2019-01-01", "2020-01-01", "2021-01-01"];
  const lanes = AGENCY_ORDER.map(k => {
    const ev = TIMELINE.filter(t => t.agency === k);
    return `<div class="tl-lane"><div class="tl-name"><span class="dot ${k}"></span>${AGENCIES[k].short}</div>
      <div class="tl-track">${years.map(y => `<i class="tl-year" style="left:${pos(y)}%"></i>`).join("")}
        ${ev.map((t, i) => `<span class="tl-ev ${k}${pos(t.date) > 62 ? " right" : ""}" style="left:${pos(t.date)}%;top:${i % 2 ? 30 : 5}px" data-tip="${esc(`${AGENCIES[k].short} · ${t.date}<br>${t.label}`)}"><i></i><b>${t.date.slice(0, 7)}</b><small>${esc(t.label)}</small></span>`).join("")}
      </div><div class="tl-src">${srcChips(ev.flatMap(t => t.src))}</div></div>`;
  }).join("");
  const axis = `<div class="tl-lane tl-axis"><div></div><div class="tl-track">${years.map(y => `<span style="left:${pos(y)}%">${y.slice(0, 4)}</span>`).join("")}</div><div></div></div>`;
  const pick = (map, k) => (k ? map[k] : null);
  const nddName = id => (id ? NDD_ANALYSES.find(r => r.id === id)?.label : null);
  const cell = (v, empty) => (v ? `<span class="dchip">${esc(v)}</span>` : `<span class="dnone">${esc(empty)}</span>`);
  const grid = `<div class="table-wrap"><table class="dgrid"><thead><tr><th>机构</th><th>手上的证据</th><th>非透析（NDD）</th><th>透析（DD）</th><th>NDD 心血管主要分析</th><th>风险管理</th></tr></thead><tbody>
    ${AGENCY_ORDER.map(k => {
      const c = REVEAL[k].choices;
      return `<tr><th scope="row"><span class="agency-tag"><span class="dot ${k}"></span>${AGENCIES[k].short}</span><small>${AGENCIES[k].when} · ${esc(AGENCIES[k].whenLabel)}</small></th>
        <td class="dg-ev">${esc(PACKAGES[k].missing ? `没有：${PACKAGES[k].missing}` : "有全球 III 期心血管汇总")}</td>
        <td>${k === "fda" ? cell("咨询委员会投票反对 1:13") : cell(pick(DECISIONS, c.decisionNdd), "本次未涉及")}</td><td>${k === "fda" ? cell("咨询委员会投票反对 2:12") : cell(pick(DECISIONS, c.decisionDd), "—")}</td>
        <td>${cell(nddName(c.ndd), "决策时没有这批数据")}</td><td>${c.rm.map(r => `<span class="dchip soft">${esc(RISK_TOOLS[r])}</span>`).join("")}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  $("overview-panel").innerHTML = `<h3>四家机构：什么时候、手上有什么、做了什么决定</h3>
    <p class="sub">中国和日本在 2018–2019 年决策，当时全球 III 期的心血管汇总还没出来；FDA 和 EMA 在 2021 年看的是同一批全球数据。</p>
    <div class="timeline">${lanes}${axis}</div>${grid}`;
}

function renderAgencyPanel() {
  const k = state.viewAgency || state.agency || "fda";
  $("agency-panel").innerHTML = `<h3>四家机构怎么解读</h3>
    <div class="agency-tabs" role="tablist">${AGENCY_ORDER.map(a => `<button type="button" role="tab" data-view="${a}" aria-selected="${a === k}"><span class="dot ${a}"></span>${AGENCIES[a].short} · ${AGENCIES[a].when}</button>`).join("")}</div>
    <p style="margin:0 0 10px;font-weight:700">${esc(AGENCIES[k].verdict)}</p>
    <ol class="steps-list">${REVEAL[k].steps.map(s => `<li><div class="k">${esc(s.k)}</div><div class="v">${esc(s.v)}</div>${quoteBlock(s.q)}</li>`).join("")}</ol>`;
}

const allLines = () => DEBATE.flatMap((r, i) => r.lines.map(l => ({ r: i, ...l })));
function renderDebate() {
  const lines = allLines(), total = lines.length;
  const shown = state.debateAll ? total : Math.max(1, Math.min(state.debateStep, total));
  const visible = lines.slice(0, shown);
  $("debate").innerHTML = DEBATE.map((round, i) => {
    const ls = visible.filter(l => l.r === i);
    if (!ls.length) return "";
    return `<div class="round"><h4>${esc(round.title)}</h4>${ls.map(l => {
      const who = l.who === "host" ? "主持人" : AGENCIES[l.who].short;
      return `<div class="turn ${l.who === "host" ? "host" : ""}"><div class="who">${l.who === "host" ? "" : `<span class="dot ${l.who}" style="margin-top:5px"></span>`}${who}</div><div><div class="say">${esc(l.say)}</div>${quoteBlock(l.q)}</div></div>`;
    }).join("")}</div>`;
  }).join("");
  $("debate-count").textContent = `${shown} / ${total}`;
  $("debate-prev").disabled = state.debateAll || shown <= 1;
  $("debate-next").disabled = state.debateAll || shown >= total;
  $("debate-all").textContent = state.debateAll ? "逐句播放" : "全部展开";
}

function renderAttribution() {
  $("attr-list").innerHTML = ATTRIBUTION.map(a => {
    const picked = state.attr[a.id] || [];
    const chips = Object.entries(LAYERS).map(([k, v]) => `<label><input type="checkbox" data-attr="${a.id}" value="${k}" ${picked.includes(k) ? "checked" : ""}>${v}</label>`).join("");
    const ans = state.attrChecked ? `<div class="answer">参考：<b>${a.answer.map(k => LAYERS[k]).join(" + ")}</b>${a.alsoEvidence ? "（另含证据不同）" : ""}。${esc(a.note)}</div>` : "";
    return `<div class="attr"><p>${esc(a.text)}</p><div class="chips">${chips}</div>${ans}</div>`;
  }).join("");
  $("attr-check").textContent = state.attrChecked ? "隐藏参考答案" : "对照参考答案";
}

// ---- render + events ---------------------------------------------------------
function renderAll() {
  renderAgencyCards(); renderBriefs(); renderWorkbench(); renderDecisionForm(); renderReveal();
  document.querySelectorAll("#pop-tabs [data-pop]").forEach(t => t.setAttribute("aria-selected", t.dataset.pop === state.pop));
}

$("board1").addEventListener("click", e => {
  if (e.target.id === "reopen-draw") { openStage(); return; }
  const pk = e.target.closest("[data-pkg]");
  if (pk) { state.pkgAgency = pk.dataset.pkg; save(); renderAgencyCards(); renderBriefs(); return; }
  const shot = e.target.closest("[data-shot]");
  if (shot) {
    const id = shot.dataset.shot;
    state.shotOpen = { ...state.shotOpen, [id]: !(state.shotOpen || {})[id] }; save(); renderBriefs();
    $(`card-${id}`).querySelector("[data-shot]").focus();
    return;
  }
  const rd = e.target.closest("[data-read]");
  if (rd) {
    const id = rd.dataset.read;
    state.read = { ...state.read, [id]: !(state.read || {})[id] }; save(); renderBriefs();
    $(`card-${id}`).querySelector("[data-read]").focus();
    return;
  }
  const full = e.target.closest("[data-full]");
  if (full) { openLightbox(full.dataset.full, full.dataset.doc, Number(full.dataset.page)); return; }
});
$("lightbox").addEventListener("click", e => { if (e.target.closest(".lb-close") || e.target.id === "lightbox") closeLightbox(); });
$("pop-tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-pop]");
  if (!b) return;
  state.pop = b.dataset.pop; save(); renderAll();
});
$("board2").addEventListener("click", e => {
  const pick = e.target.closest("[data-pick]");
  if (pick) { if (state.pop === "ndd") state.nddPick = pick.dataset.pick; else state.ddPick = pick.dataset.pick; save(); renderMace(); return; }
  const pre = e.target.closest("[data-preset]");
  if (pre) {
    if (pre.dataset.preset === "reseed") state.sim.seed += 1; else Object.assign(state.sim, SIM_PRESETS[pre.dataset.preset]);
    save(); renderSim();
  }
});
let simTimer = null;
$("board2").addEventListener("input", e => {
  const id = e.target.id;
  if (id === "s-hr") state.sim.trueHR = Number(e.target.value);
  else if (id === "s-drop") state.sim.dropPlaHigh = Number(e.target.value);
  else if (id === "s-post") state.sim.postMult = Number(e.target.value);
  else if (id === "s-yrs") { state.nmpaYears = Number(e.target.value); save(); renderNmpaConv(); return; }
  else if (id === "s-w") {
    state.weight = Number(e.target.value); save();
    $("o-w").textContent = state.weight;
    $("w-read").innerHTML = weightRead(Number(e.target.dataset.b), Number(e.target.dataset.r), state.weight);
    return;
  } else return;
  save();
  clearTimeout(simTimer); simTimer = setTimeout(renderSim, 120);
});
$("board2").addEventListener("click", e => {
  const b = e.target.closest("[data-npop]");
  if (b) { state.nmpaPop = Number(b.dataset.npop); save(); document.querySelectorAll("#nmpa-pop [data-npop]").forEach(x => x.setAttribute("aria-selected", x === b)); renderNmpaConv(); }
});
$("board2").addEventListener("change", e => {
  if (e.target.id === "t-613") { state.include613 = e.target.checked; save(); renderMace(); }
  if (e.target.id === "t-split") { state.split = e.target.checked; save(); renderMace(); }
});
$("board2").addEventListener("toggle", e => { if (e.target.id === "sim-box") { state.simOpen = e.target.open; save(); } }, true);
$("decision-form").addEventListener("submit", e => {
  e.preventDefault();
  if (!state.agency) { $("decision-sub").textContent = "请先在第 1 步拿到你们的机构，再提交。"; location.hash = "#board1"; return; }
  const fd = new FormData(e.target);
  state.decisions[state.agency] = { ndd: fd.get("ndd"), dd: fd.get("dd"), rm: fd.getAll("rm"), reason: $("reason").value.trim() };
  save();
  $("saved").hidden = false; setTimeout(() => { $("saved").hidden = true; }, 2000);
  renderReveal();
});
$("reveal-btn").addEventListener("click", () => {
  if (!state.agency || !state.decisions[state.agency]) return;
  state.revealed = true; save(); renderAll(); $("board3").scrollIntoView();
});
// Clears this browser's record (agency choice, answers, reading progress) and returns to the choice page.
$("reset-btn").addEventListener("click", () => {
  if (!confirm("清空这台设备上的机构选择、阅读进度和作答，重新开始？")) return;
  try { localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ }
  location.href = location.pathname;
});
$("agency-panel").addEventListener("click", e => {
  const b = e.target.closest("[data-view]");
  if (b) { state.viewAgency = b.dataset.view; save(); renderAgencyPanel(); }
});
$("debate-next").addEventListener("click", () => { state.debateStep += 1; save(); renderDebate(); });
$("debate-prev").addEventListener("click", () => { state.debateStep = Math.max(1, state.debateStep - 1); save(); renderDebate(); });
$("debate-all").addEventListener("click", () => { state.debateAll = !state.debateAll; save(); renderDebate(); });
$("attr-list").addEventListener("change", e => {
  const id = e.target.dataset.attr;
  if (!id) return;
  const set = new Set(state.attr[id] || []);
  if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
  state.attr[id] = [...set]; save();
});
$("attr-check").addEventListener("click", () => { state.attrChecked = !state.attrChecked; save(); renderAttribution(); });
$("theme-btn").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = cur === "dark" ? "light" : "dark";
  state.theme = document.documentElement.dataset.theme; save();
});

if (state.theme) document.documentElement.dataset.theme = state.theme;
save();
renderAll();
