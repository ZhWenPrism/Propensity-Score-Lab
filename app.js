"use strict";

const N = 360;
const FEATURES = [
  { key: "age", name: "年龄" },
  { key: "female", name: "性别 F" },
  { key: "sofa", name: "入科前 SOFA" },
  { key: "map", name: "MAP" },
  { key: "lactate", name: "乳酸" },
  { key: "creatinine", name: "肌酐" }
];
const SCENARIOS = { mild: 0.35, moderate: 0.75, strong: 1.25 };
let state = { seed: 20261013, scenario: "moderate", rows: [], match: null, selectedId: null, page: 0 };

const $ = id => document.getElementById(id);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const logistic = x => 1 / (1 + Math.exp(-clamp(x, -30, 30)));
const fmt = (x, n = 2) => Number.isFinite(x) ? x.toFixed(n) : "—";
const signed = (x, n = 1) => Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${fmt(x, n)}` : "—";
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / Math.max(1, a.length - 1));
const fmtPS = x => x < 0.0005 ? "<0.001" : x > 0.9995 ? ">0.999" : fmt(x, 3);

function randomGenerator(seed) {
  let s = seed >>> 0;
  const random = () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
  return { random, normal };
}

function simulate(scenario, seed) {
  const rng = randomGenerator(seed);
  const scale = SCENARIOS[scenario];
  const rows = [];
  for (let i = 0; i < N; i++) {
    const severityZ = rng.normal(), ageZ = rng.normal();
    const female = rng.random() < 0.44 ? 1 : 0;
    const age = Math.round(clamp(64 + 13 * ageZ, 18, 89));
    const sofa = Math.round(clamp(6 + 2.9 * severityZ + 0.4 * ageZ + 0.8 * rng.normal(), 0, 20));
    const map = Math.round(clamp(69 - 8.5 * severityZ + 6 * rng.normal(), 42, 105));
    const lactate = clamp(2.2 + 1.05 * severityZ + 0.62 * rng.normal(), 0.6, 9.5);
    const creatinine = clamp(1.2 + 0.42 * severityZ + 0.18 * ageZ + 0.38 * rng.normal(), 0.4, 5.8);
    const sofaZ = (sofa - 6) / 3, mapZ = (map - 69) / 10;
    const lactateZ = (lactate - 2.2) / 1.2, creatinineZ = (creatinine - 1.2) / 0.6;
    const assignment = logistic(-0.35 + scale * (0.22 * ageZ + 0.78 * sofaZ - 0.62 * mapZ + 0.42 * lactateZ + 0.14 * creatinineZ + 0.08 * (female - 0.44)));
    const treated = rng.random() < assignment ? 1 : 0;
    const riskLogit = -1.55 + 0.28 * ageZ + 0.42 * sofaZ - 0.19 * mapZ + 0.23 * lactateZ + 0.12 * creatinineZ;
    const death = rng.random() < logistic(riskLogit - 0.48 * treated) ? 1 : 0;
    const month = String(1 + Math.floor(rng.random() * 12)).padStart(2, "0");
    const day = String(1 + Math.floor(rng.random() * 28)).padStart(2, "0");
    const hour = String(Math.floor(rng.random() * 24)).padStart(2, "0");
    rows.push({
      subject_id: 91000001 + i, hadm_id: 92000001 + i, stay_id: 93000001 + i,
      gender: female ? "F" : "M", female, age, sofa, map, lactate, creatinine, treated, death,
      admission_type: rng.random() < 0.78 ? "EMERGENCY" : "URGENT",
      first_careunit: ["MICU", "SICU", "TSICU"][Math.floor(rng.random() * 3)],
      intime: `2153-${month}-${day} ${hour}:00`,
      actual_assignment_probability: assignment
    });
  }
  fitPropensity(rows);
  return rows;
}

function solveLinear(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) return Array(n).fill(0);
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const mult = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= mult * a[col][j];
    }
  }
  return a.map(row => row[n]);
}

function fitPropensity(rows) {
  const centers = FEATURES.map(f => mean(rows.map(p => p[f.key])));
  const spreads = FEATURES.map(f => Math.max(sd(rows.map(p => p[f.key])), 1e-8));
  const x = rows.map(p => [1, ...FEATURES.map((f, j) => (p[f.key] - centers[j]) / spreads[j])]);
  const size = FEATURES.length + 1;
  let beta = Array(size).fill(0);
  for (let step = 0; step < 60; step++) {
    const gradient = Array(size).fill(0);
    const hessian = Array.from({ length: size }, () => Array(size).fill(0));
    x.forEach((vector, i) => {
      const probability = logistic(vector.reduce((s, v, j) => s + v * beta[j], 0));
      const variance = Math.max(probability * (1 - probability), 1e-8);
      for (let j = 0; j < size; j++) {
        gradient[j] += vector[j] * (rows[i].treated - probability);
        for (let k = 0; k < size; k++) hessian[j][k] += variance * vector[j] * vector[k];
      }
    });
    for (let j = 1; j < size; j++) { gradient[j] -= 0.01 * beta[j]; hessian[j][j] += 0.01; }
    const delta = solveLinear(hessian, gradient);
    beta = beta.map((b, j) => b + delta[j]);
    if (Math.max(...delta.map(Math.abs)) < 1e-8) break;
  }
  rows.forEach((p, i) => {
    p.ps = clamp(logistic(x[i].reduce((s, v, j) => s + v * beta[j], 0)), 1e-6, 1 - 1e-6);
    p.logit = Math.log(p.ps / (1 - p.ps));
  });
}

function makeMatches(rows) {
  const treated = rows.filter(p => p.treated), controls = rows.filter(p => !p.treated);
  const caliper = 0.2 * sd(rows.map(p => p.logit));
  const candidates = [];
  for (const t of treated) for (const c of controls) {
    const distance = Math.abs(t.logit - c.logit);
    if (distance <= caliper) candidates.push({ t, c, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance || a.t.subject_id - b.t.subject_id || a.c.subject_id - b.c.subject_id);
  const usedT = new Set(), usedC = new Set(), pairs = [], partner = new Map(), distance = new Map();
  for (const item of candidates) {
    if (usedT.has(item.t.subject_id) || usedC.has(item.c.subject_id)) continue;
    usedT.add(item.t.subject_id); usedC.add(item.c.subject_id);
    pairs.push(item);
    partner.set(item.t.subject_id, item.c.subject_id);
    partner.set(item.c.subject_id, item.t.subject_id);
    distance.set(item.t.subject_id, item.distance);
    distance.set(item.c.subject_id, item.distance);
  }
  return { pairs, partner, distance, caliper };
}

function weights(rows, method, match) {
  return rows.map(p => method === "psm" ? (match.partner.has(p.subject_id) ? 1 : 0)
    : method === "iptw" ? (p.treated ? 1 / p.ps : 1 / (1 - p.ps))
    : p.treated ? 1 - p.ps : p.ps);
}
function weightedMean(rows, values, ws, treated) {
  let total = 0, sumWeights = 0;
  rows.forEach((p, i) => { if (p.treated === treated) { total += values[i] * ws[i]; sumWeights += ws[i]; } });
  return sumWeights ? total / sumWeights : NaN;
}
function ess(rows, ws, treated) {
  let sum = 0, sumSquares = 0;
  rows.forEach((p, i) => { if (p.treated === treated) { sum += ws[i]; sumSquares += ws[i] ** 2; } });
  return sumSquares ? sum * sum / sumSquares : 0;
}
function smd(rows, ws, key) {
  const t = rows.filter(p => p.treated).map(p => p[key]), c = rows.filter(p => !p.treated).map(p => p[key]);
  const denominator = Math.sqrt((sd(t) ** 2 + sd(c) ** 2) / 2);
  return denominator ? (weightedMean(rows, rows.map(p => p[key]), ws, 1) - weightedMean(rows, rows.map(p => p[key]), ws, 0)) / denominator : 0;
}
function effect(rows, ws, method, match) {
  if (method === "psm") return match.pairs.length ? 100 * mean(match.pairs.map(({ t, c }) => t.death - c.death)) : NaN;
  return 100 * (weightedMean(rows, rows.map(p => p.death), ws, 1) - weightedMean(rows, rows.map(p => p.death), ws, 0));
}
function methodSummary(rows, method, match) {
  const ws = weights(rows, method, match);
  return {
    ws,
    maxSmd: Math.max(...FEATURES.map(f => Math.abs(smd(rows, ws, f.key)))),
    effect: effect(rows, ws, method, match),
    treatedRisk: 100 * weightedMean(rows, rows.map(p => p.death), ws, 1),
    controlRisk: 100 * weightedMean(rows, rows.map(p => p.death), ws, 0),
    essT: ess(rows, ws, 1), essC: ess(rows, ws, 0)
  };
}

function renderHistogram(rows) {
  const buckets = Array.from({ length: 16 }, () => [0, 0]);
  rows.forEach(p => buckets[Math.min(15, Math.floor(p.ps * 16))][p.treated ? 0 : 1]++);
  const peak = Math.max(...buckets.flat(), 1);
  const bars = buckets.map((counts, i) => {
    const x = 4 + i * 5.8, w = 4.3;
    return `<rect x="${x}" y="${75 - counts[0] / peak * 64}" width="${w}" height="${counts[0] / peak * 64}" rx="1" fill="#0a827c"/><rect x="${x}" y="79" width="${w}" height="${counts[1] / peak * 64}" rx="1" fill="#dc8069"/>`;
  }).join("");
  $("ps-chart").innerHTML = `<svg viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true"><line x1="50" y1="0" x2="50" y2="150" stroke="#d9e7e4" stroke-dasharray="2 2"/><line x1="0" y1="77" x2="100" y2="77" stroke="#b5cac5"/>${bars}</svg>`;
}

function renderCohort(rows) {
  const ordered = [...rows].sort((a, b) => a.ps - b.ps);
  $("cohort-grid").innerHTML = ordered.map(p => `<button type="button" class="patient-dot ${p.treated ? "treated" : "control"}${p.subject_id === state.selectedId ? " selected" : ""}" data-id="${p.subject_id}" aria-label="${p.subject_id}，${p.treated ? "启动去甲肾上腺素" : "未启动"}，PS ${fmtPS(p.ps)}" aria-pressed="${p.subject_id === state.selectedId}"></button>`).join("");
  $("cohort-count").textContent = `${rows.length} 条 ICU stay`;
}

function renderPatient(rows, match) {
  const p = rows.find(row => row.subject_id === state.selectedId) || rows[0];
  $("subject-id").textContent = p.subject_id;
  $("hadm-id").textContent = p.hadm_id;
  $("stay-id").textContent = p.stay_id;
  $("admit-time").textContent = p.intime;
  $("careunit").textContent = p.first_careunit;
  $("admission-type").textContent = p.admission_type;
  $("patient-treatment").textContent = p.treated ? "启动去甲肾上腺素" : "未启动";
  $("patient-treatment").className = `treatment-tag ${p.treated ? "treated" : "control"}`;
  $("p-age").textContent = `${p.age} 岁`;
  $("p-gender").textContent = p.gender;
  $("p-sofa").textContent = p.sofa;
  $("p-map").textContent = `${p.map} mmHg`;
  $("p-lactate").textContent = `${fmt(p.lactate, 1)} mmol/L`;
  $("p-creatinine").textContent = `${fmt(p.creatinine, 2)} mg/dL`;
  $("p-death").textContent = p.death ? "死亡" : "存活";
  $("p-ps").textContent = fmtPS(p.ps);
  $("ps-marker").style.left = `${p.ps * 100}%`;
}

function renderMethodCards(rows, match, summaries) {
  const p = rows.find(row => row.subject_id === state.selectedId) || rows[0];
  const index = rows.indexOf(p);
  const partner = match.partner.get(p.subject_id);
  const distance = match.distance.get(p.subject_id);
  $("psm-value").textContent = partner ? `↔ ${partner}` : "未配对";
  $("psm-calc").textContent = partner ? `|logit PS 差| = ${fmt(distance, 3)} ≤ 卡钳 ${fmt(match.caliper, 3)}` : `卡钳 ${fmt(match.caliper, 3)} · 无可用配对`;
  $("psm-n").textContent = `${match.pairs.length} 对`;
  $("psm-smd").textContent = fmt(summaries.psm.maxSmd);
  $("psm-effect").textContent = `${signed(summaries.psm.effect)} pp`;
  $("psm-risks").textContent = `治疗组 ${fmt(summaries.psm.treatedRisk, 1)}% · 对照组 ${fmt(summaries.psm.controlRisk, 1)}%`;

  const iptw = summaries.iptw.ws[index];
  const denominator = p.treated ? p.ps : 1 - p.ps;
  $("iptw-value").textContent = fmt(iptw, 3);
  $("iptw-calc").textContent = `${p.treated ? "1 / PS" : "1 / (1 − PS)"} = 1 / ${fmt(denominator, 4)} = ${fmt(iptw, 3)}`;
  $("iptw-n").textContent = `${Math.round(summaries.iptw.essT)} / ${Math.round(summaries.iptw.essC)}`;
  $("iptw-smd").textContent = fmt(summaries.iptw.maxSmd);
  $("iptw-effect").textContent = `${signed(summaries.iptw.effect)} pp`;
  $("iptw-risks").textContent = `治疗组 ${fmt(summaries.iptw.treatedRisk, 1)}% · 对照组 ${fmt(summaries.iptw.controlRisk, 1)}%`;

  const ow = summaries.ow.ws[index];
  $("ow-value").textContent = fmt(ow, 3);
  $("ow-calc").textContent = p.treated ? `1 − PS = 1 − ${fmt(p.ps, 4)} = ${fmt(ow, 3)}` : `PS = ${fmt(p.ps, 4)} = ${fmt(ow, 3)}`;
  $("ow-n").textContent = `${Math.round(summaries.ow.essT)} / ${Math.round(summaries.ow.essC)}`;
  $("ow-smd").textContent = fmt(summaries.ow.maxSmd);
  $("ow-effect").textContent = `${signed(summaries.ow.effect)} pp`;
  $("ow-risks").textContent = `治疗组 ${fmt(summaries.ow.treatedRisk, 1)}% · 对照组 ${fmt(summaries.ow.controlRisk, 1)}%`;
}

function renderBalance(rows, summaries) {
  const before = rows.map(() => 1);
  $("balance-rows").innerHTML = FEATURES.map(f => {
    const values = [
      Math.abs(smd(rows, before, f.key)),
      Math.abs(smd(rows, summaries.psm.ws, f.key)),
      Math.abs(smd(rows, summaries.iptw.ws, f.key)),
      Math.abs(smd(rows, summaries.ow.ws, f.key))
    ];
    return `<tr><th scope="row">${f.name}</th>${values.map((v, i) => `<td><span class="smd-pill ${i && v < 0.1 ? "good" : i && v >= 0.1 ? "warn" : ""}">${fmt(v)}</span></td>`).join("")}</tr>`;
  }).join("");
}

function renderTable(rows, match, summaries) {
  const query = $("patient-search").value.trim();
  const filtered = rows.filter(p => String(p.subject_id).includes(query) || String(p.hadm_id).includes(query) || String(p.stay_id).includes(query));
  const perPage = 20, pages = Math.max(1, Math.ceil(filtered.length / perPage));
  state.page = clamp(state.page, 0, pages - 1);
  const visible = filtered.slice(state.page * perPage, (state.page + 1) * perPage);
  $("patient-rows").innerHTML = visible.length ? visible.map(p => {
    const index = rows.indexOf(p);
    return `<tr data-id="${p.subject_id}" class="${p.subject_id === state.selectedId ? "selected" : ""}"><td><strong>${p.subject_id}</strong></td><td>${p.age}</td><td>${p.gender}</td><td>${p.sofa}</td><td>${p.map}</td><td>${fmt(p.lactate, 1)}</td><td>${fmt(p.creatinine, 2)}</td><td><span class="treatment-tag ${p.treated ? "treated" : "control"}">${p.treated ? "启动" : "未启动"}</span></td><td>${p.death ? "死亡" : "存活"}</td><td>${fmtPS(p.ps)}</td><td>${match.partner.get(p.subject_id) || "—"}</td><td>${fmt(summaries.iptw.ws[index], 2)}</td><td>${fmt(summaries.ow.ws[index], 2)}</td></tr>`;
  }).join("") : `<tr><td colspan="13">没有找到记录</td></tr>`;
  $("page-status").textContent = `${filtered.length ? state.page * perPage + 1 : 0}–${Math.min((state.page + 1) * perPage, filtered.length)} / ${filtered.length}`;
  $("page-prev").disabled = state.page === 0;
  $("page-next").disabled = state.page >= pages - 1;
}

function render() {
  const rows = state.rows, match = state.match;
  const summaries = {
    psm: methodSummary(rows, "psm", match),
    iptw: methodSummary(rows, "iptw", match),
    ow: methodSummary(rows, "ow", match)
  };
  $("total-count").textContent = rows.length;
  $("treated-count").textContent = rows.filter(p => p.treated).length;
  $("control-count").textContent = rows.filter(p => !p.treated).length;
  $("raw-smd").textContent = fmt(Math.max(...FEATURES.map(f => Math.abs(smd(rows, rows.map(() => 1), f.key)))));
  renderCohort(rows);
  renderPatient(rows, match);
  renderMethodCards(rows, match, summaries);
  renderHistogram(rows);
  renderBalance(rows, summaries);
  renderTable(rows, match, summaries);
}
function regenerate() {
  state.rows = simulate(state.scenario, state.seed);
  state.match = makeMatches(state.rows);
  state.selectedId = state.match.pairs[0]?.t.subject_id || state.rows[0].subject_id;
  state.page = 0;
  $("patient-search").value = "";
  render();
}
$("scenario").addEventListener("change", event => { state.scenario = event.target.value; state.seed += 1; regenerate(); });
$("regenerate").addEventListener("click", () => { state.seed += 1; regenerate(); });
$("cohort-grid").addEventListener("click", event => {
  const dot = event.target.closest("[data-id]");
  if (dot) { state.selectedId = Number(dot.dataset.id); render(); }
});
$("patient-rows").addEventListener("click", event => {
  const row = event.target.closest("[data-id]");
  if (row) { state.selectedId = Number(row.dataset.id); render(); }
});
$("patient-search").addEventListener("input", () => { state.page = 0; render(); });
$("page-prev").addEventListener("click", () => { state.page -= 1; render(); });
$("page-next").addEventListener("click", () => { state.page += 1; render(); });
regenerate();
