"use strict";

const $ = id => document.getElementById(id);
const state = { seed: 20261013, scenario: "moderate", cohort: [], keys: new Set(DEFAULT_KEYS), excluded: new Set(), view: "iptw", selectedId: null, page: 0 };
const PRESETS = {
  default: DEFAULT_KEYS,
  all: COVARIATES.map(c => c.key),
  nosofa: DEFAULT_KEYS.filter(k => k !== "sofa"),
  instrument: [...DEFAULT_KEYS, "pref"]
};
const VIEW_TITLE = { raw: "调整前", psm: "PSM 配对后", iptw: "IPTW 加权后", ow: "OW 加权后" };
const groupName = treated => (treated ? "去甲组" : "对照组");
let calc = null;
let candidateCache = { key: "", rows: [] };

const orderedKeys = () => COVARIATES.map(c => c.key).filter(k => state.keys.has(k));
const selectedRow = () => state.cohort.find(p => p.subject_id === state.selectedId) || state.cohort[0];

function influenceCandidates(full, keys) {
  const cacheKey = `${state.seed}|${state.scenario}|${keys.join(",")}`;
  if (candidateCache.key === cacheKey) return candidateCache.rows;
  const { cohort, w } = full;
  const totals = { 1: 0, 0: 0 };
  cohort.forEach((p, i) => { totals[p.treated] += w.iptw[i]; });
  const rows = cohort.map((_, i) => i).sort((a, b) => w.iptw[b] - w.iptw[a]).slice(0, 6).map(i => {
    const p = cohort[i];
    const without = analyze(cohort.filter(q => q.subject_id !== p.subject_id), keys);
    return { id: p.subject_id, p, ps: full.ps[i], iptw: w.iptw[i], share: w.iptw[i] / totals[p.treated], ow: w.ow[i], iptwHr: without.results.iptw.cox, owHr: without.results.ow.cox };
  });
  candidateCache = { key: cacheKey, rows };
  return rows;
}

function recompute() {
  const keys = orderedKeys();
  const included = state.cohort.filter(p => !state.excluded.has(p.subject_id));
  const main = analyze(included, keys, { km: true, truth: true, alternatives: true });
  const full = state.excluded.size ? analyze(state.cohort, keys, { alternatives: true }) : main;
  const refModel = fitPropensity(included, DEFAULT_KEYS);
  const psAll = new Map(state.cohort.map(p => [p.subject_id, predictPS(main.model, p)]));
  const psRef = new Map(state.cohort.map(p => [p.subject_id, predictPS(refModel, p)]));
  const layout = swarmLayout(state.cohort.map(p => ({ id: p.subject_id, x: psAll.get(p.subject_id), up: !!p.treated })), SWARM_WIDTH);
  calc = { keys, main, full, psAll, psRef, layout, candidates: influenceCandidates(full, keys) };
  if (state.selectedId === null) state.selectedId = (calc.candidates.find(c => !c.p.treated) || calc.candidates[0])?.id ?? state.cohort[0].subject_id;
  render();
}

function regenerate() {
  state.cohort = simulate(state.scenario, state.seed);
  state.excluded.clear();
  state.selectedId = null;
  state.page = 0;
  $("patient-search").value = "";
  recompute();
}

// ---- Step 1 -------------------------------------------------------------

function initCovariateList() {
  $("covariate-list").innerHTML = COVARIATES.map(c => `
    <label class="cov-item">
      <input type="checkbox" data-key="${c.key}">
      <span class="cov-main"><strong>${c.name}</strong><small>${c.source}</small></span>
      <span class="role-tag ${c.role}">${ROLE_LABEL[c.role]}</span>
      <span class="cov-or" id="or-${c.key}">—</span>
    </label>`).join("");
}

function renderCovariates() {
  const ors = new Map(oddsRatios(calc.main.model).map(o => [o.key, o]));
  COVARIATES.forEach(c => {
    document.querySelector(`#covariate-list input[data-key="${c.key}"]`).checked = state.keys.has(c.key);
    const o = ors.get(c.key);
    $(`or-${c.key}`).textContent = o ? `OR ${fmt(o.or)} (${fmt(o.lo)}–${fmt(o.hi)})` : "未入模";
    $(`or-${c.key}`).classList.toggle("off", !o);
  });
  const current = orderedKeys().join(",");
  document.querySelectorAll("[data-preset]").forEach(b => b.classList.toggle("active", PRESETS[b.dataset.preset].join(",") === current));
}

function renderScatter() {
  const { psAll, psRef, main } = calc;
  const points = state.cohort.map(p => {
    const x = psRef.get(p.subject_id), y = psAll.get(p.subject_id);
    return { id: p.subject_id, x, y, treated: p.treated, excluded: !main.indexById.has(p.subject_id), tip: `${p.subject_id} · ${groupName(p.treated)}<br>默认模型 PS ${fmtPS(x)} → 当前 ${fmtPS(y)}` };
  });
  $("ps-scatter").innerHTML = scatterSvg(points, state.selectedId);
  const deltas = points.filter(p => !p.excluded).map(p => Math.abs(p.y - p.x));
  const p = selectedRow();
  const same = orderedKeys().join(",") === DEFAULT_KEYS.join(",");
  $("ps-shift").innerHTML = same
    ? `当前为默认模型<br>选中 ${p.subject_id}：PS ${fmtPS(psAll.get(p.subject_id))}`
    : `与默认模型相比：平均 |ΔPS| = ${fmt(mean(deltas), 3)}，最大 ${fmt(Math.max(...deltas), 3)}<br>选中 ${p.subject_id}：PS ${fmtPS(psRef.get(p.subject_id))} → ${fmtPS(psAll.get(p.subject_id))}`;
}

// ---- Step 2 -------------------------------------------------------------

function renderHistograms() {
  const { main } = calc, r = main.results;
  const masses = Object.fromEntries(METHODS.map(m => [m, massBins(main.cohort, main.ps, main.w[m])]));
  const maxMass = Math.max(...METHODS.flatMap(m => [...masses[m].t, ...masses[m].c]), 0.01);
  const nT = main.cohort.filter(p => p.treated).length, nC = main.cohort.length - nT;
  const sub = {
    raw: `${nT} vs ${nC} 人`,
    psm: `${main.match.pairs.length} 对 · 去甲组配上 ${pct(main.match.pairs.length / main.match.nTreated, 0)}`,
    iptw: `ESS ${Math.round(r.iptw.essT)} vs ${Math.round(r.iptw.essC)}`,
    ow: `ESS ${Math.round(r.ow.essT)} vs ${Math.round(r.ow.essC)}`
  };
  $("hist-grid").innerHTML = METHODS.map(m => `
    <article class="panel hist-panel${m === state.view ? " active" : ""}" data-view="${m}" tabindex="0" role="button" aria-pressed="${m === state.view}" aria-label="${VIEW_TITLE[m]}，在第 3 步显示此方法">
      <div class="hist-head"><strong>${VIEW_TITLE[m]}</strong><span title="两组 PS 分布重叠比例">OVL ${fmt(overlap(masses[m]))}</span></div>
      <div class="hist-sub">${sub[m]}</div>
      ${histogramSvg(masses[m], m === "raw" ? null : masses.raw, maxMass, `${VIEW_TITLE[m]} PS 分布`)}
      <div class="hist-axis">PS</div>
    </article>`).join("");
}

function renderLove() {
  const { main } = calc;
  const rows = COVARIATES.map(c => ({
    name: c.name,
    inModel: state.keys.has(c.key),
    tag: `${ROLE_LABEL[c.role]}${state.keys.has(c.key) ? "" : " · 未入模"}`,
    values: Object.fromEntries(METHODS.map(m => [m, main.balance[m][c.key]]))
  }));
  const maxV = Math.max(...rows.flatMap(r => METHODS.map(m => Math.abs(r.values[m]))));
  const maxX = maxV > 1 ? Math.ceil(maxV * 4) / 4 : Math.max(0.4, Math.ceil(maxV * 10) / 10);
  $("love-plot").innerHTML = loveSvg(rows, maxX);
  $("love-legend").innerHTML = METHODS.map(m => `<span>${loveKey(m)}${LOVE_MARKS[m].label}</span>`).join("");
  $("balance-rows").innerHTML = rows.map(r => `<tr><th scope="row">${r.name}</th><td>${r.inModel ? "入模" : "未入模"}</td>${METHODS.map((m, i) => {
    const v = Math.abs(r.values[m]);
    return `<td><span class="smd-pill ${i && v < 0.1 ? "good" : i ? "warn" : ""}">${fmt(v)}</span></td>`;
  }).join("")}</tr>`).join("");
}

// ---- Step 3 -------------------------------------------------------------

function renderSwarm() {
  const { main, layout, psAll } = calc, view = state.view;
  const groupMean = {};
  ["iptw", "ow"].forEach(m => {
    groupMean[m] = { 1: [], 0: [] };
    main.cohort.forEach((p, i) => groupMean[m][p.treated].push(main.w[m][i]));
    groupMean[m] = { 1: mean(groupMean[m][1]), 0: mean(groupMean[m][0]) };
  });
  const items = state.cohort.map(p => {
    const i = main.indexById.get(p.subject_id);
    let rel = 1, mode = "fill", detail = "";
    if (i === undefined) { mode = "excluded"; detail = "<br>已排除"; }
    else if (view === "psm") {
      const partner = main.match.partner.get(i);
      mode = partner === undefined ? "hollow" : "fill";
      detail = partner === undefined ? "<br>PSM：未配上" : `<br>PSM：配对 ${main.cohort[partner].subject_id}`;
    } else if (view === "iptw" || view === "ow") {
      rel = main.w[view][i] / groupMean[view][p.treated];
      mode = "weight";
      detail = `<br>${METHOD_LABEL[view]} 权重 ${fmt(main.w[view][i])}（组内均值的 ${fmt(rel, 1)} 倍）`;
    }
    return { id: p.subject_id, treated: p.treated, rel, mode, tip: `${p.subject_id} · ${groupName(p.treated)}<br>PS ${fmtPS(psAll.get(p.subject_id))} · ${p.death ? "28 天内死亡" : "28 天存活"}${detail}` };
  });
  $("swarm").innerHTML = swarmSvg(layout, items, state.selectedId);
  $("cohort-count").textContent = `${main.cohort.length} 条纳入${state.excluded.size ? ` · ${state.excluded.size} 条排除` : ""}`;
  const caption = {
    raw: "按当前模型的 PS 从左到右排列",
    psm: `实心 = 配上（${main.match.pairs.length} 对），空心 = 未配上`,
    iptw: `圆面积 ∝ IPTW 权重 / 本组平均权重 · 最大权重 ${fmt(main.results.iptw.maxWeight, 1)}`,
    ow: `圆面积 ∝ OW 权重 / 本组平均权重 · 最大权重 ${fmt(main.results.ow.maxWeight, 2)}`
  };
  $("swarm-caption").textContent = caption[view];
  document.querySelectorAll("#view-switch button").forEach(b => {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-pressed", b.dataset.view === view);
  });
}

function renderPatient() {
  const p = selectedRow(), { main, psAll, psRef } = calc;
  const i = main.indexById.get(p.subject_id);
  $("subject-id").textContent = p.subject_id;
  $("hadm-id").textContent = p.hadm_id;
  $("stay-id").textContent = p.stay_id;
  $("admit-time").textContent = p.intime;
  $("careunit").textContent = `${p.first_careunit} · ${p.admission_type}`;
  $("patient-treatment").textContent = p.treated ? "启动去甲肾上腺素" : "未启动";
  $("patient-treatment").className = `treatment-tag ${p.treated ? "treated" : "control"}`;
  const fields = [
    ["patients.anchor_age", "年龄", `${p.age} 岁`],
    ["patients.gender", "性别", p.gender],
    ["derived · 治疗前", "SOFA", p.sofa],
    ["chartevents · 治疗前", "MAP", `${p.map} mmHg`],
    ["labevents · 治疗前", "乳酸", `${fmt(p.lactate, 1)} mmol/L`],
    ["labevents · 治疗前", "肌酐", `${fmt(p.creatinine, 2)} mg/dL`],
    ["合成 · 主治医疗组", "医疗组偏好", p.pref ? "偏好用" : "不偏好"],
    ["合成 · diagnoses_icd", "恶性肿瘤", p.malignancy ? "有" : "无"]
  ];
  $("vitals").innerHTML = fields.map(([src, label, value]) => `<div><small>${src}</small><span>${label}</span><strong>${value}</strong></div>`).join("");
  const ps = psAll.get(p.subject_id);
  $("p-ps").textContent = fmtPS(ps);
  $("p-ps-ref").textContent = i === undefined ? "已排除 · 按当前模型预测" : `默认模型 ${fmtPS(psRef.get(p.subject_id))}`;
  $("ps-marker").style.left = `${ps * 100}%`;
  $("p-death").textContent = p.death ? "死亡" : "存活";
  $("p-time").textContent = p.death ? `第 ${fmt(p.time, 1)} 天` : "第 28 天删失";
  $("exclude-toggle").textContent = state.excluded.has(p.subject_id) ? "恢复此人，整条流程重算" : "排除此人，整条流程重算";
  $("exclude-toggle").classList.toggle("active", state.excluded.has(p.subject_id));
}

function weightShare(m, i) {
  const { main } = calc, g = main.cohort[i].treated;
  let total = 0, rank = 1, n = 0;
  main.cohort.forEach((q, k) => {
    if (q.treated !== g) return;
    n++; total += main.w[m][k];
    if (main.w[m][k] > main.w[m][i]) rank++;
  });
  return `占${groupName(g)}总权重 ${pct(main.w[m][i] / total, 1)} · 组内排名 ${rank}/${n}`;
}

function renderMethodCards() {
  const p = selectedRow(), { main } = calc, r = main.results;
  const i = main.indexById.get(p.subject_id);
  $("psm-n").textContent = `${main.match.pairs.length} 对`;
  $("psm-share").textContent = pct(main.match.pairs.length / main.match.nTreated, 0);
  $("psm-smd").textContent = fmt(r.psm.maxSmd);
  ["iptw", "ow"].forEach(m => {
    $(`${m}-n`).textContent = `${Math.round(r[m].essT)} / ${Math.round(r[m].essC)}`;
    $(`${m}-max`).textContent = fmt(r[m].maxWeight, m === "ow" ? 2 : 1);
    $(`${m}-smd`).textContent = fmt(r[m].maxSmd);
  });
  if (i === undefined) {
    ["psm", "iptw", "ow"].forEach(m => { $(`${m}-value`).textContent = "已排除"; $(`${m}-calc`).textContent = "此人不在当前分析中"; });
    $("iptw-share").textContent = $("ow-share").textContent = "";
    return;
  }
  const partner = main.match.partner.get(i), d = main.match.distance.get(i);
  $("psm-value").textContent = partner === undefined ? "未配对" : `↔ ${main.cohort[partner].subject_id}`;
  $("psm-calc").textContent = partner === undefined ? `卡钳 ${fmt(main.match.caliper, 3)} 内没有可用对象` : `|logit PS 差| = ${fmt(d, 3)} ≤ 卡钳 ${fmt(main.match.caliper, 3)}`;
  const e = main.ps[i];
  $("iptw-value").textContent = fmt(main.w.iptw[i], 3);
  $("iptw-calc").textContent = p.treated ? `1 / PS = 1 / ${fmt(e, 4)}` : `1 / (1 − PS) = 1 / ${fmt(1 - e, 4)}`;
  $("iptw-share").textContent = weightShare("iptw", i);
  $("ow-value").textContent = fmt(main.w.ow[i], 3);
  $("ow-calc").textContent = p.treated ? `1 − PS = 1 − ${fmt(e, 4)}` : `PS = ${fmt(e, 4)}`;
  $("ow-share").textContent = weightShare("ow", i);
}

// ---- Step 4 -------------------------------------------------------------

function renderInfluence() {
  const { candidates, full, main } = calc;
  const fullIptw = full.results.iptw.cox, fullOw = full.results.ow.cox;
  $("influence-rows").innerHTML = candidates.map(c => `
    <tr data-id="${c.id}" class="${c.id === state.selectedId ? "selected" : ""}">
      <td><input type="checkbox" data-exclude="${c.id}" ${state.excluded.has(c.id) ? "checked" : ""} aria-label="排除 ${c.id}"></td>
      <td><strong>${c.id}</strong></td>
      <td><span class="treatment-tag ${c.p.treated ? "treated" : "control"}">${c.p.treated ? "启动" : "未启动"}</span></td>
      <td>${fmtPS(c.ps)}</td><td><strong>${fmt(c.iptw, 1)}</strong></td><td>${pct(c.share, 1)}</td><td>${fmt(c.ow, 2)}</td>
      <td>${c.p.death ? `死亡 · 第 ${fmt(c.p.time, 1)} 天` : "存活"}</td>
      <td>${fmt(fullIptw?.hr)} → <strong>${fmt(c.iptwHr?.hr)}</strong></td>
      <td>${fmt(fullOw?.hr)} → <strong>${fmt(c.owHr?.hr)}</strong></td>
    </tr>`).join("");
  const ex = [...state.excluded];
  $("excluded-list").textContent = ex.length ? `已排除：${ex.join("、")}` : "当前未排除任何人";
  $("restore-all").disabled = !ex.length;
  $("compare-sub").textContent = ex.length
    ? `排除 ${ex.length} 人 · 剩余 ${main.cohort.length} 人重新估计`
    : "勾选上表“排除”后显示排除后的结果";
  const rows = [
    ["PSM", f => f.results.psm, false],
    ["IPTW", f => f.results.iptw, true],
    ["OW", f => f.results.ow, true],
    ["IPTW · 权重截断 1%/99%（预设）", f => f.alternatives.trunc, true],
    ["IPTW · PS 修剪 0.1–0.9（预设）", f => f.alternatives.trim, true]
  ];
  $("compare-rows").innerHTML = rows.map(([label, get, weighted]) => {
    const a = get(full), b = ex.length ? get(main) : null;
    return `<tr><th scope="row">${label}</th><td>${hrText(a.cox)}</td><td>${b ? `<strong>${hrText(b.cox)}</strong>` : "—"}</td>
      <td>${signedPP(a.rd)} pp${b ? ` → <strong>${signedPP(b.rd)} pp</strong>` : ""}</td>
      <td>${Math.round(a.essC)}${b ? ` → <strong>${Math.round(b.essC)}</strong>` : ""}</td>
      <td>${weighted ? `${fmt(a.maxWeight, 1)}${b ? ` → <strong>${fmt(b.maxWeight, 1)}</strong>` : ""}` : "—"}</td></tr>`;
  }).join("");
}

// ---- Step 5 -------------------------------------------------------------

let kmData = {};
function renderSurvival() {
  const { main } = calc, r = main.results, t = main.truth;
  const minS = Math.min(...METHODS.flatMap(m => [...r[m].km1, ...r[m].km0].map(s => s.s)));
  const yMin = Math.max(0, Math.floor((minS - 0.05) * 10) / 10);
  const sub = {
    raw: `全部 ${main.cohort.length} 人，不调整`,
    psm: `配对样本 ${main.match.pairs.length} 对`,
    iptw: `加权 · ESS ${Math.round(r.iptw.essT)} vs ${Math.round(r.iptw.essC)}`,
    ow: `加权 · ESS ${Math.round(r.ow.essT)} vs ${Math.round(r.ow.essC)}`
  };
  kmData = {};
  $("km-grid").innerHTML = METHODS.map(m => {
    kmData[m] = { km1: r[m].km1, km0: r[m].km0, yMin };
    return `<article class="panel km-panel">
      <div class="hist-head"><strong>${METHOD_LABEL[m]}</strong><span>${ESTIMAND[m]}</span></div>
      <div class="hist-sub">${sub[m]}</div>
      ${kmSvg(r[m].km1, r[m].km0, yMin, m)}
      <div class="km-foot"><span>HR <strong>${hrText(r[m].cox)}</strong></span><span>P <strong>${fmtP(r[m].cox?.p)}</strong></span></div>
    </article>`;
  }).join("");
  $("forest").innerHTML = forestSvg(METHODS.map(m => ({
    label: METHOD_LABEL[m], sub: ESTIMAND[m], hr: r[m].cox?.hr, lo: r[m].cox?.lo, hi: r[m].cox?.hi, p: r[m].cox?.p, truth: m === "raw" ? NaN : t[m].hr
  })));
  $("result-rows").innerHTML = METHODS.map(m => `<tr>
    <th scope="row">${METHOD_LABEL[m]}<small>${ESTIMAND[m]}</small></th>
    <td>${pct(r[m].r1)} / ${pct(r[m].r0)}</td>
    <td>${rdText(r[m])} pp</td><td>${fmtP(r[m].rdP)}</td>
    <td>${hrText(r[m].cox)}</td><td>${fmtP(r[m].cox?.p)}</td>
    <td>${m === "raw" ? "—" : `${signedPP(t[m].rd)} pp / ${fmt(t[m].hr)}`}</td>
  </tr>`).join("");
}

function moveCrosshair(event) {
  const hit = event.target.closest(".km-hit");
  if (!hit) return;
  const svg = hit.ownerSVGElement, box = svg.getBoundingClientRect(), d = kmData[hit.dataset.km];
  const { W, L, R } = KM_GEOM;
  const vx = (event.clientX - box.left) / box.width * W;
  const day = clamp((vx - L) / (W - L - R) * FOLLOW_UP, 0, FOLLOW_UP);
  const line = svg.querySelector(".km-cross");
  const x = L + day / FOLLOW_UP * (W - L - R);
  line.setAttribute("x1", x); line.setAttribute("x2", x); line.setAttribute("visibility", "visible");
  showTip(`第 ${day.toFixed(1)} 天<br>去甲组生存 ${pct(survivalAt(d.km1, day))}<br>对照组生存 ${pct(survivalAt(d.km0, day))}`, event);
}

// ---- Records ------------------------------------------------------------

function renderTable() {
  const { main, psAll } = calc;
  const query = $("patient-search").value.trim();
  const filtered = state.cohort.filter(p => [p.subject_id, p.hadm_id, p.stay_id].some(v => String(v).includes(query)));
  const perPage = 20, pages = Math.max(1, Math.ceil(filtered.length / perPage));
  state.page = clamp(state.page, 0, pages - 1);
  const visible = filtered.slice(state.page * perPage, (state.page + 1) * perPage);
  $("patient-rows").innerHTML = visible.length ? visible.map(p => {
    const i = main.indexById.get(p.subject_id), inc = i !== undefined;
    const partner = inc ? main.match.partner.get(i) : undefined;
    return `<tr data-id="${p.subject_id}" tabindex="0" class="${p.subject_id === state.selectedId ? "selected" : ""}${inc ? "" : " excluded"}"><td><strong>${p.subject_id}</strong></td><td>${p.age}</td><td>${p.gender}</td><td>${p.sofa}</td><td>${p.map}</td><td>${fmt(p.lactate, 1)}</td><td>${fmt(p.creatinine, 2)}</td><td>${p.pref ? "是" : "否"}</td><td>${p.malignancy ? "有" : "无"}</td><td><span class="treatment-tag ${p.treated ? "treated" : "control"}">${p.treated ? "启动" : "未启动"}</span></td><td>${fmt(p.time, 1)}</td><td>${p.death ? "死亡" : "存活"}</td><td>${fmtPS(psAll.get(p.subject_id))}</td><td>${partner !== undefined ? main.cohort[partner].subject_id : "—"}</td><td>${inc ? fmt(main.w.iptw[i]) : "—"}</td><td>${inc ? fmt(main.w.ow[i]) : "—"}</td><td>${inc ? "纳入" : "已排除"}</td></tr>`;
  }).join("") : `<tr><td colspan="17">没有找到记录</td></tr>`;
  $("page-status").textContent = `${filtered.length ? state.page * perPage + 1 : 0}–${Math.min((state.page + 1) * perPage, filtered.length)} / ${filtered.length}`;
  $("page-prev").disabled = state.page === 0;
  $("page-next").disabled = state.page >= pages - 1;
}

function renderMetrics() {
  const { main } = calc, nT = main.cohort.filter(p => p.treated).length;
  $("total-count").textContent = main.cohort.length;
  $("excluded-note").textContent = state.excluded.size ? `已排除 ${state.excluded.size} 人` : "";
  $("treated-count").textContent = nT;
  $("control-count").textContent = main.cohort.length - nT;
  $("raw-smd").textContent = fmt(main.results.raw.maxSmd);
  $("cstat").textContent = fmt(main.cstat, 3);
}

function render() {
  renderMetrics();
  renderCovariates();
  renderScatter();
  renderHistograms();
  renderLove();
  renderSwarm();
  renderPatient();
  renderMethodCards();
  renderInfluence();
  renderSurvival();
  renderTable();
}

// ---- Events -------------------------------------------------------------

const tip = $("tooltip");
function showTip(html, event) {
  tip.innerHTML = html;
  tip.hidden = false;
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + w > window.innerWidth - 8) x = event.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = event.clientY - h - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
document.addEventListener("mousemove", event => {
  if (event.target.closest(".km-hit")) return moveCrosshair(event);
  const target = event.target.closest("[data-tip]");
  if (target) showTip(target.dataset.tip, event); else tip.hidden = true;
});
document.addEventListener("mouseout", event => {
  const hit = event.target.closest(".km-hit");
  if (hit && !hit.contains(event.relatedTarget)) hit.ownerSVGElement.querySelector(".km-cross").setAttribute("visibility", "hidden");
  if (!event.relatedTarget || !event.relatedTarget.closest?.("[data-tip], .km-hit")) tip.hidden = true;
});

function select(id) {
  state.selectedId = id;
  render();
}
function toggleExclude(id) {
  if (state.excluded.has(id)) state.excluded.delete(id); else state.excluded.add(id);
  recompute();
}
function setView(view) {
  state.view = view;
  renderHistograms();
  renderSwarm();
}

$("scenario").addEventListener("change", event => { state.scenario = event.target.value; state.seed += 1; regenerate(); });
$("regenerate").addEventListener("click", () => { state.seed += 1; regenerate(); });
$("covariate-list").addEventListener("change", event => {
  const key = event.target.dataset.key;
  if (!key) return;
  if (event.target.checked) state.keys.add(key); else state.keys.delete(key);
  recompute();
});
document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { state.keys = new Set(PRESETS[b.dataset.preset]); recompute(); }));
$("view-switch").addEventListener("click", event => { const b = event.target.closest("[data-view]"); if (b) setView(b.dataset.view); });
$("hist-grid").addEventListener("click", event => { const panel = event.target.closest("[data-view]"); if (panel) setView(panel.dataset.view); });
$("hist-grid").addEventListener("keydown", event => {
  const panel = event.target.closest("[data-view]");
  if (panel && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setView(panel.dataset.view); }
});
["swarm", "ps-scatter"].forEach(id => $(id).addEventListener("click", event => {
  const pt = event.target.closest("[data-id]");
  if (pt) select(Number(pt.dataset.id));
}));
$("exclude-toggle").addEventListener("click", () => toggleExclude(state.selectedId));
$("influence-rows").addEventListener("change", event => { const id = event.target.dataset.exclude; if (id) toggleExclude(Number(id)); });
$("influence-rows").addEventListener("click", event => {
  if (event.target.closest("input")) return;
  const row = event.target.closest("[data-id]");
  if (row) select(Number(row.dataset.id));
});
$("restore-all").addEventListener("click", () => { state.excluded.clear(); recompute(); });
$("patient-rows").addEventListener("click", event => { const row = event.target.closest("[data-id]"); if (row) select(Number(row.dataset.id)); });
$("patient-rows").addEventListener("keydown", event => {
  const row = event.target.closest("[data-id]");
  if (row && event.key === "Enter") select(Number(row.dataset.id));
});
$("patient-search").addEventListener("input", () => { state.page = 0; renderTable(); });
$("page-prev").addEventListener("click", () => { state.page -= 1; renderTable(); });
$("page-next").addEventListener("click", () => { state.page += 1; renderTable(); });

initCovariateList();
regenerate();
