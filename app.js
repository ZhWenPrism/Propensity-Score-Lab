"use strict";

const N = 240;
const FEATURES = [
  { key: "age", name: "年龄" },
  { key: "severity", name: "病情严重度" },
  { key: "egfr", name: "肾功能" }
];
const SCENARIOS = {
  mild: { label: "较弱", beta: [0.15, 0.25, -0.12] },
  moderate: { label: "中等", beta: [0.45, 1.05, -0.65] },
  strong: { label: "很强", beta: [1.0, 2.5, -1.6] }
};
const METHOD = {
  psm: {
    title: "PSM：为用药者找相似对照",
    description: "按 PS 的 logit 距离做 1:1 最近邻配对，设定 0.2 × 标准差的卡钳，不重复使用对照患者。配不到的人本次不参与疗效比较。",
    formula: "配对成功 → 参与；未配对 → 不参与",
    note: "下面的患者表会显示具体配对对象。",
    target: "这里估计的是成功配对的用药患者中的平均差异，不能自动推广到全部患者。"
  },
  iptw: {
    title: "IPTW：让少见的治疗选择有更多分量",
    description: "保留所有患者。某类患者越少接受其实际获得的治疗，代表性权重越大，尝试重建两组基线特征相近的加权人群。",
    formula: "用药者：1 / PS；对照者：1 / (1 − PS)",
    note: "例如 PS = 0.8：实际用药权重 1.25，实际未用药权重 5。",
    target: "目标是原研究人群的平均治疗效应（ATE）；极端权重可能让结果很不稳定。"
  },
  ow: {
    title: "OW：重点比较两组有交集的人",
    description: "保留所有患者，但对只能找到很少可比对象的人给较小权重。PS 接近 0.5 的患者通常获得较多综合关注。",
    formula: "用药者：1 − PS；对照者：PS",
    note: "例如 PS = 0.8：实际用药权重 0.2，实际未用药权重 0.8。",
    target: "目标是治疗选择存在重叠的患者中的平均效应（ATO），不同于总体 ATE。"
  }
};

let state = { seed: 20261013, scenario: "moderate", method: "psm", patients: [], match: null };
const $ = id => document.getElementById(id);
const fmt = (v, digits = 2) => Number.isFinite(v) ? v.toFixed(digits) : "—";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const logistic = x => 1 / (1 + Math.exp(-clamp(x, -30, 30)));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1));

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
  const beta = SCENARIOS[scenario].beta;
  const rows = [];
  for (let i = 0; i < N; i++) {
    const ageZ = rng.normal();
    const severityZ = 0.32 * ageZ + 0.95 * rng.normal();
    const kidneyZ = -0.35 * ageZ - 0.25 * severityZ + 0.9 * rng.normal();
    const age = clamp(65 + 12 * ageZ, 35, 90);
    const severity = clamp(5 + 1.8 * severityZ, 0, 10);
    const egfr = clamp(78 + 22 * kidneyZ, 20, 125);
    const actual = logistic(-0.1 + beta[0] * ageZ + beta[1] * severityZ + beta[2] * kidneyZ);
    const treated = rng.random() < actual ? 1 : 0;
    // A constant +8 point effect is built into this wholly synthetic outcome.
    const improvement = 50 - 0.12 * (age - 65) - 2.5 * severity + 0.065 * (egfr - 78) + 8 * treated + 7 * rng.normal();
    rows.push({ id: `P${String(i + 1).padStart(3, "0")}`, age, severity, egfr, treated, improvement, actual });
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
  const spreads = FEATURES.map(f => sd(rows.map(p => p[f.key])));
  const X = rows.map(p => [1, ...FEATURES.map((f, j) => (p[f.key] - centers[j]) / spreads[j])]);
  let beta = [0, 0, 0, 0];
  for (let step = 0; step < 40; step++) {
    const gradient = Array(4).fill(0);
    const hessian = Array.from({ length: 4 }, () => Array(4).fill(0));
    X.forEach((x, i) => {
      const p = logistic(x.reduce((s, xi, j) => s + xi * beta[j], 0));
      const weight = Math.max(p * (1 - p), 1e-8);
      for (let j = 0; j < 4; j++) {
        gradient[j] += x[j] * (rows[i].treated - p);
        for (let k = 0; k < 4; k++) hessian[j][k] += weight * x[j] * x[k];
      }
    });
    for (let j = 0; j < 4; j++) hessian[j][j] += 1e-7;
    const delta = solveLinear(hessian, gradient);
    beta = beta.map((b, j) => b + delta[j]);
    if (Math.max(...delta.map(Math.abs)) < 1e-8) break;
  }
  rows.forEach((p, i) => {
    p.ps = clamp(logistic(X[i].reduce((s, xi, j) => s + xi * beta[j], 0)), 1e-6, 1 - 1e-6);
    p.logit = Math.log(p.ps / (1 - p.ps));
  });
}

function makeMatches(rows) {
  const treated = rows.filter(p => p.treated);
  const controls = rows.filter(p => !p.treated);
  const caliper = 0.2 * sd(rows.map(p => p.logit));
  const candidate = [];
  for (const t of treated) for (const c of controls) {
    const distance = Math.abs(t.logit - c.logit);
    if (distance <= caliper) candidate.push({ t, c, distance });
  }
  candidate.sort((a, b) => a.distance - b.distance || a.t.id.localeCompare(b.t.id) || a.c.id.localeCompare(b.c.id));
  const usedT = new Set(), usedC = new Set(), pairs = [], partner = new Map();
  for (const item of candidate) {
    if (usedT.has(item.t.id) || usedC.has(item.c.id)) continue;
    usedT.add(item.t.id); usedC.add(item.c.id);
    pairs.push(item); partner.set(item.t.id, item.c.id); partner.set(item.c.id, item.t.id);
  }
  return { pairs, partner, caliper };
}

function weights(rows, method, match) {
  const matched = match.partner;
  return rows.map(p => method === "psm" ? (matched.has(p.id) ? 1 : 0) : method === "iptw" ? (p.treated ? 1 / p.ps : 1 / (1 - p.ps)) : (p.treated ? 1 - p.ps : p.ps));
}
function weightedMean(rows, values, ws, treated) {
  let numerator = 0, denominator = 0;
  rows.forEach((p, i) => { if (p.treated === treated) { numerator += values[i] * ws[i]; denominator += ws[i]; } });
  return denominator ? numerator / denominator : NaN;
}
function ess(rows, ws, treated) {
  const w = ws.filter((_, i) => rows[i].treated === treated);
  const sum = w.reduce((a, b) => a + b, 0);
  const sumSquares = w.reduce((a, b) => a + b * b, 0);
  return sumSquares ? sum * sum / sumSquares : 0;
}
function baselineScale(rows, key) {
  const t = rows.filter(p => p.treated).map(p => p[key]);
  const c = rows.filter(p => !p.treated).map(p => p[key]);
  return Math.sqrt((sd(t) ** 2 + sd(c) ** 2) / 2);
}
function smd(rows, ws, key) {
  const values = rows.map(p => p[key]);
  return (weightedMean(rows, values, ws, 1) - weightedMean(rows, values, ws, 0)) / baselineScale(rows, key);
}
function effect(rows, ws, method, match) {
  if (method === "psm") return match.pairs.length ? mean(match.pairs.map(({ t, c }) => t.improvement - c.improvement)) : NaN;
  return weightedMean(rows, rows.map(p => p.improvement), ws, 1) - weightedMean(rows, rows.map(p => p.improvement), ws, 0);
}
function renderPSChart(rows) {
  const buckets = Array.from({ length: 16 }, () => [0, 0]);
  rows.forEach(p => buckets[Math.min(15, Math.floor(p.ps * 16))][p.treated ? 0 : 1]++);
  const peak = Math.max(...buckets.flat(), 1);
  const bars = buckets.map((counts, i) => {
    const x = 5 + i * (90 / 16), width = 90 / 16 - 1.4;
    const treatedHeight = counts[0] / peak * 61, controlHeight = counts[1] / peak * 61;
    return `<rect x="${x}" y="${77 - treatedHeight}" width="${width}" height="${treatedHeight}" rx="1" fill="#087f84"/><rect x="${x}" y="82" width="${width}" height="${controlHeight}" rx="1" fill="#df735f"/>`;
  }).join("");
  $("ps-chart").innerHTML = `<svg viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true"><line x1="50" y1="0" x2="50" y2="150" stroke="#dce9e6" stroke-dasharray="2 2"/><line x1="0" y1="79" x2="100" y2="79" stroke="#b7ccc8"/>${bars}</svg>`;
}
function renderBasics(rows) {
  $("total-count").textContent = rows.length;
  $("treated-count").textContent = rows.filter(p => p.treated).length;
  $("control-count").textContent = rows.filter(p => !p.treated).length;
  const baseline = FEATURES.map(f => Math.abs(smd(rows, rows.map(() => 1), f.key)));
  $("baseline-smd").textContent = fmt(Math.max(...baseline));
  renderPSChart(rows);
}
function renderMethod(rows, ws, match) {
  const method = state.method, meta = METHOD[method];
  document.querySelectorAll(".method-tab").forEach(tab => {
    const active = tab.dataset.method === method;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  $("method-panel").setAttribute("aria-labelledby", `tab-${method}`);
  $("method-title").textContent = meta.title;
  $("method-description").textContent = meta.description;
  $("method-formula").textContent = meta.formula;
  $("formula-note").textContent = meta.note;
  $("target-note").textContent = meta.target;
  if (method === "psm") {
    $("stat-one-label").textContent = "成功配对";
    $("stat-one").textContent = `${match.pairs.length} 对`;
    $("stat-two-label").textContent = "未进入分析";
    $("stat-two").textContent = `${rows.length - 2 * match.pairs.length} 人`;
  } else {
    $("stat-one-label").textContent = "两组有效样本量 ESS";
    $("stat-one").textContent = `${Math.round(ess(rows, ws, 1))} / ${Math.round(ess(rows, ws, 0))}`;
    $("stat-two-label").textContent = "最大个人权重";
    $("stat-two").textContent = fmt(Math.max(...ws), method === "iptw" ? 1 : 2);
  }
}
function renderBalance(rows, ws) {
  const before = rows.map(() => 1);
  const values = FEATURES.map(f => ({ name: f.name, before: Math.abs(smd(rows, before, f.key)), after: Math.abs(smd(rows, ws, f.key)) }));
  const max = Math.max(0.3, ...values.flatMap(v => [v.before, v.after]));
  $("balance-bars").innerHTML = values.map(v => `<div class="balance-row"><label>${v.name}</label><div class="bar-track" style="--threshold-pos:${0.1 / max * 100}%" title="处理前 ${fmt(v.before)}；处理后 ${fmt(v.after)}"><span class="bar before" style="width:${v.before / max * 100}%"></span><span class="bar after" style="width:${v.after / max * 100}%"></span></div><output>${fmt(v.after)}</output></div>`).join("");
  const beforeMax = Math.max(...values.map(v => v.before)), afterMax = Math.max(...values.map(v => v.after));
  const callout = $("balance-comment");
  callout.classList.toggle("warn", afterMax >= 0.1);
  callout.textContent = `最大 |SMD|：${fmt(beforeMax)} → ${fmt(afterMax)}。${afterMax < 0.1 ? "所展示的三项基线特征均低于 0.1 参考线。" : "至少一项仍高于 0.1，需检查模型、重叠与研究设计。"}`;
  $("legend-after").textContent = `${state.method.toUpperCase()} 后`;
}
function renderEffect(rows, ws, match) {
  const before = rows.map(() => 1);
  $("naive-effect").textContent = `${effect(rows, before, "iptw", match) >= 0 ? "+" : ""}${fmt(effect(rows, before, "iptw", match), 1)} 分`;
  const adjusted = effect(rows, ws, state.method, match);
  $("adjusted-effect").textContent = Number.isFinite(adjusted) ? `${adjusted >= 0 ? "+" : ""}${fmt(adjusted, 1)} 分` : "无法估计";
  $("adjusted-label").textContent = `${state.method.toUpperCase()} 后比较`;
}
function renderPatients(rows, ws, match) {
  const method = state.method;
  $("method-column").textContent = method === "psm" ? "配对结果" : "个人权重";
  $("patient-intro").textContent = method === "psm" ? "看谁找到配对对象、谁被排除。" : "看同一个患者在当前方法下占多大分量。";
  const query = $("patient-search").value.trim().toLowerCase();
  const ordered = rows.map((p, i) => ({ ...p, weight: ws[i] })).sort((a, b) => a.ps - b.ps);
  const filtered = query ? ordered.filter(p => p.id.toLowerCase().includes(query)) : Array.from({ length: 16 }, (_, i) => ordered[Math.floor((i + 0.5) / 16 * ordered.length)]);
  $("patient-rows").innerHTML = filtered.length ? filtered.slice(0, 16).map(p => `<tr><td><strong>${p.id}</strong></td><td><span class="treatment-tag ${p.treated ? "treated" : "control"}">${p.treated ? "药物 A" : "常规治疗"}</span></td><td>${Math.round(p.age)}</td><td>${fmt(p.severity, 1)}</td><td>${Math.round(p.egfr)}</td><td><strong>${p.ps < 0.0005 ? "<0.001" : p.ps > 0.9995 ? ">0.999" : fmt(p.ps, 3)}</strong></td><td>${method === "psm" ? (match.partner.has(p.id) ? `与 ${match.partner.get(p.id)} 配对` : "未配对") : fmt(p.weight, 2)}</td></tr>`).join("") : '<tr><td colspan="7">没有找到该编号的患者。</td></tr>';
}
function render() {
  const rows = state.patients, match = state.match, ws = weights(rows, state.method, match);
  renderBasics(rows); renderMethod(rows, ws, match); renderBalance(rows, ws); renderEffect(rows, ws, match); renderPatients(rows, ws, match);
}
function regenerate() {
  state.patients = simulate(state.scenario, state.seed);
  state.match = makeMatches(state.patients);
  render();
}
$("scenario").addEventListener("change", event => { state.scenario = event.target.value; state.seed += 1; regenerate(); });
$("regenerate").addEventListener("click", () => { state.seed += 1; regenerate(); });
document.querySelectorAll(".method-tab").forEach(tab => tab.addEventListener("click", () => { state.method = tab.dataset.method; render(); }));
$("patient-search").addEventListener("input", () => renderPatients(state.patients, weights(state.patients, state.method, state.match), state.match));
regenerate();
