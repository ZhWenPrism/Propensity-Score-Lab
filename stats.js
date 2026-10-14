"use strict";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const logistic = x => 1 / (1 + Math.exp(-clamp(x, -30, 30)));
const sum = a => a.reduce((s, x) => s + x, 0);
const mean = a => a.length ? sum(a) / a.length : NaN;
const variance = a => {
  const m = mean(a);
  return a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1);
};
const sd = a => Math.sqrt(variance(a));

const METHODS = ["raw", "psm", "iptw", "ow"];
const METHOD_LABEL = { raw: "未调整", psm: "PSM", iptw: "IPTW", ow: "OW" };
const ESTIMAND = { raw: "关联，非因果", psm: "配上的去甲患者 (ATT*)", iptw: "全体患者 (ATE)", ow: "重叠人群 (ATO)" };
const TRUTH_DRAWS = 20;

function solveLinear(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) return Array(n).fill(0);
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
const invertSymmetric = m => m.map((_, j) => solveLinear(m, m.map((__, i) => (i === j ? 1 : 0))));

// erfc(|z|/√2), Numerical Recipes erfcc (fractional error < 1.2e-7)
function twoSidedP(z) {
  if (!Number.isFinite(z)) return NaN;
  const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.5 * x);
  return t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
}

function fitPropensity(rows, keys) {
  const share = clamp(mean(rows.map(p => p.treated)), 1e-6, 1 - 1e-6);
  if (!keys.length) return { keys, centers: [], spreads: [], beta: [Math.log(share / (1 - share))], se: [NaN] };
  const centers = keys.map(k => mean(rows.map(p => p[k])));
  const spreads = keys.map(k => Math.max(sd(rows.map(p => p[k])), 1e-8));
  const x = rows.map(p => [1, ...keys.map((k, j) => (p[k] - centers[j]) / spreads[j])]);
  const size = keys.length + 1;
  let beta = Array(size).fill(0), hessian = [];
  for (let step = 0; step < 60; step++) {
    const gradient = Array(size).fill(0);
    hessian = Array.from({ length: size }, () => Array(size).fill(0));
    x.forEach((v, i) => {
      const prob = logistic(v.reduce((s, xv, j) => s + xv * beta[j], 0));
      const varp = Math.max(prob * (1 - prob), 1e-8);
      for (let j = 0; j < size; j++) {
        gradient[j] += v[j] * (rows[i].treated - prob);
        for (let k = 0; k < size; k++) hessian[j][k] += varp * v[j] * v[k];
      }
    });
    for (let j = 1; j < size; j++) { gradient[j] -= 0.01 * beta[j]; hessian[j][j] += 0.01; }
    const delta = solveLinear(hessian, gradient);
    beta = beta.map((b, j) => b + delta[j]);
    if (Math.max(...delta.map(Math.abs)) < 1e-8) break;
  }
  const cov = invertSymmetric(hessian);
  return { keys, centers, spreads, beta, se: cov.map((row, j) => Math.sqrt(Math.max(row[j], 0))) };
}

function predictPS(model, p) {
  const z = model.beta[0] + model.keys.reduce((s, k, j) => s + model.beta[j + 1] * (p[k] - model.centers[j]) / model.spreads[j], 0);
  return clamp(logistic(z), 1e-6, 1 - 1e-6);
}

// OR per 1 SD for continuous covariates, per unit (0→1) for binary ones
function oddsRatios(model) {
  return model.keys.map((key, j) => {
    const cov = COVARIATES.find(c => c.key === key);
    const scale = cov.binary ? 1 / model.spreads[j] : 1;
    const b = model.beta[j + 1] * scale, se = model.se[j + 1] * scale;
    return { key, or: Math.exp(b), lo: Math.exp(b - 1.96 * se), hi: Math.exp(b + 1.96 * se) };
  });
}

function cStatistic(scores, labels) {
  const order = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranks = Array(scores.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && scores[order[j + 1]] === scores[order[i]]) j++;
    for (let k = i; k <= j; k++) ranks[order[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  const n1 = sum(labels), n0 = labels.length - n1;
  if (!n1 || !n0) return NaN;
  const r1 = labels.reduce((s, y, i) => s + (y ? ranks[i] : 0), 0);
  return (r1 - n1 * (n1 + 1) / 2) / (n1 * n0);
}

// 1:1 greedy nearest neighbour on logit(PS), no replacement, caliper 0.2 SD
function makeMatches(cohort, logit) {
  const caliper = 0.2 * sd(logit);
  const treated = [], controls = [];
  cohort.forEach((p, i) => (p.treated ? treated : controls).push(i));
  const candidates = [];
  for (const t of treated) for (const c of controls) {
    const d = Math.abs(logit[t] - logit[c]);
    if (d <= caliper + 1e-12) candidates.push([d, t, c]);
  }
  candidates.sort((a, b) => a[0] - b[0] || cohort[a[1]].subject_id - cohort[b[1]].subject_id || cohort[a[2]].subject_id - cohort[b[2]].subject_id);
  const partner = new Map(), distance = new Map(), pairOf = new Map(), pairs = [];
  for (const [d, t, c] of candidates) {
    if (partner.has(t) || partner.has(c)) continue;
    partner.set(t, c); partner.set(c, t);
    distance.set(t, d); distance.set(c, d);
    pairOf.set(t, pairs.length); pairOf.set(c, pairs.length);
    pairs.push([t, c, d]);
  }
  return { caliper, partner, distance, pairOf, pairs, nTreated: treated.length };
}

function smdFor(cohort, w, key, pooled) {
  let s1 = 0, w1 = 0, s0 = 0, w0 = 0;
  cohort.forEach((p, i) => {
    if (!w[i]) return;
    if (p.treated) { s1 += w[i] * p[key]; w1 += w[i]; } else { s0 += w[i] * p[key]; w0 += w[i]; }
  });
  return w1 && w0 && pooled ? (s1 / w1 - s0 / w0) / pooled : 0;
}

function ess(cohort, w, group) {
  let s = 0, s2 = 0;
  cohort.forEach((p, i) => { if (p.treated === group && w[i] > 0) { s += w[i]; s2 += w[i] ** 2; } });
  return s2 ? s * s / s2 : 0;
}

// Hájek weighted risks; sandwich SE treating weights as fixed, clustered when cluster ids are given
function riskDifference(cohort, w, cluster) {
  let a1 = 0, b1 = 0, a0 = 0, b0 = 0;
  cohort.forEach((p, i) => {
    if (!w[i]) return;
    if (p.treated) { a1 += w[i] * p.death; b1 += w[i]; } else { a0 += w[i] * p.death; b0 += w[i]; }
  });
  const r1 = a1 / b1, r0 = a0 / b0, rd = r1 - r0;
  const contrib = new Map();
  cohort.forEach((p, i) => {
    if (!w[i]) return;
    const psi = p.treated ? w[i] * (p.death - r1) / b1 : -w[i] * (p.death - r0) / b0;
    const id = cluster ? cluster[i] : i;
    contrib.set(id, (contrib.get(id) || 0) + psi);
  });
  let v = 0;
  contrib.forEach(x => { v += x * x; });
  const se = Math.sqrt(v);
  return { r1, r0, rd, rdLo: rd - 1.96 * se, rdHi: rd + 1.96 * se, rdP: twoSidedP(rd / se) };
}

// Weighted Cox model with one binary covariate, Breslow ties.
// robust: Lin–Wei sandwich variance from score residuals, summed within clusters.
function coxFit(time, event, x, w, cluster, robust) {
  const idx = time.map((_, i) => i).filter(i => w[i] > 0).sort((a, b) => time[a] - time[b]);
  if (!idx.length) return null;
  const groups = [];
  for (const i of idx) {
    const last = groups[groups.length - 1];
    if (last && last.t === time[i]) last.members.push(i); else groups.push({ t: time[i], members: [i] });
  }
  const evaluate = beta => {
    let S0 = 0, S1 = 0, U = 0, I = 0, ll = 0;
    const at = new Array(groups.length);
    for (let g = groups.length - 1; g >= 0; g--) {
      let dW = 0, dWx = 0;
      for (const i of groups[g].members) {
        const r = w[i] * Math.exp(beta * x[i]);
        S0 += r; S1 += r * x[i];
        if (event[i]) { dW += w[i]; dWx += w[i] * x[i]; }
      }
      if (dW > 0) {
        const xbar = S1 / S0;
        U += dWx - dW * xbar;
        I += dW * xbar * (1 - xbar);
        ll += beta * dWx - dW * Math.log(S0);
      }
      at[g] = { S0, S1, dW };
    }
    return { U, I, ll, at };
  };
  let beta = 0, cur = evaluate(0);
  for (let it = 0; it < 60; it++) {
    if (!(cur.I > 1e-10)) return null;
    let step = clamp(cur.U / cur.I, -5, 5), next = evaluate(beta + step), halvings = 0;
    while (next.ll < cur.ll - 1e-10 && halvings < 30) { step /= 2; next = evaluate(beta + step); halvings++; }
    beta += step; cur = next;
    if (Math.abs(step) < 1e-10) break;
  }
  if (!(cur.I > 1e-10) || Math.abs(beta) > 10) return null;
  let varBeta = 1 / cur.I;
  if (robust) {
    const cum = new Array(groups.length);
    let A0 = 0, A1 = 0;
    groups.forEach((_, g) => {
      const { S0, S1, dW } = cur.at[g];
      if (dW > 0) { A0 += dW / S0; A1 += (S1 / S0) * dW / S0; }
      cum[g] = [A0, A1];
    });
    const D = new Map();
    groups.forEach((grp, g) => {
      const xbar = cur.at[g].S1 / cur.at[g].S0;
      for (const i of grp.members) {
        const u = (event[i] ? x[i] - xbar : 0) - Math.exp(beta * x[i]) * (x[i] * cum[g][0] - cum[g][1]);
        const id = cluster ? cluster[i] : i;
        D.set(id, (D.get(id) || 0) + w[i] * u);
      }
    });
    let meat = 0;
    D.forEach(v => { meat += v * v; });
    varBeta = meat / cur.I ** 2;
  }
  const se = Math.sqrt(varBeta);
  return { beta, se, hr: Math.exp(beta), lo: Math.exp(beta - 1.96 * se), hi: Math.exp(beta + 1.96 * se), p: twoSidedP(beta / se) };
}

function kaplanMeier(cohort, w, group) {
  const idx = cohort.map((_, i) => i).filter(i => w[i] > 0 && cohort[i].treated === group).sort((a, b) => cohort[a].time - cohort[b].time);
  let atRisk = sum(idx.map(i => w[i])), s = 1;
  const steps = [{ t: 0, s: 1 }];
  for (let k = 0; k < idx.length;) {
    const t = cohort[idx[k]].time;
    let d = 0, removed = 0;
    while (k < idx.length && cohort[idx[k]].time === t) {
      const i = idx[k++];
      removed += w[i];
      if (cohort[i].death) d += w[i];
    }
    if (d > 0) { s *= 1 - d / atRisk; steps.push({ t, s }); }
    atRisk -= removed;
  }
  return steps;
}

function outcomeAnalysis(cohort, w, { cluster = null, robust = true, km = false } = {}) {
  const time = cohort.map(p => p.time), event = cohort.map(p => p.death), x = cohort.map(p => p.treated);
  const result = riskDifference(cohort, w, cluster);
  result.cox = coxFit(time, event, x, w, cluster, robust);
  result.essT = ess(cohort, w, 1);
  result.essC = ess(cohort, w, 0);
  result.nUsed = w.filter(v => v > 0).length;
  result.maxWeight = Math.max(...w);
  if (km) { result.km1 = kaplanMeier(cohort, w, 1); result.km0 = kaplanMeier(cohort, w, 0); }
  return result;
}

function pooledSds(cohort) {
  const out = {};
  COVARIATES.forEach(c => {
    const t = cohort.filter(p => p.treated).map(p => p[c.key]);
    const u = cohort.filter(p => !p.treated).map(p => p[c.key]);
    out[c.key] = Math.sqrt((variance(t) + variance(u)) / 2);
  });
  return out;
}
const maxAbsSmd = (cohort, w, pooled) => Math.max(...OUTCOME_KEYS.map(k => Math.abs(smdFor(cohort, w, k, pooled[k]))));

// Sample truth for a target population with weights v: risk difference from the
// known outcome model, marginal HR from a Cox fit to paired potential event times.
function trueEffect(cohort, v) {
  const W = sum(v);
  if (!W) return { rd: NaN, hr: NaN };
  const rd = cohort.reduce((s, p, i) => s + v[i] * (p.truth.risk1 - p.truth.risk0), 0) / W;
  const time = [], event = [], x = [], w = [];
  cohort.forEach((p, i) => {
    if (!v[i]) return;
    for (let k = 0; k < TRUTH_DRAWS; k++) {
      const u = (k + 0.5) / TRUTH_DRAWS;
      for (const a of [1, 0]) {
        const t = eventTime(p.truth.lp, a, u), dead = t <= FOLLOW_UP;
        time.push(dead ? t : FOLLOW_UP); event.push(dead ? 1 : 0); x.push(a); w.push(v[i]);
      }
    }
  });
  const cox = coxFit(time, event, x, w, null, false);
  return { rd, hr: cox ? cox.hr : NaN };
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function alternativeAnalyses(cohort, ps, iptw, pooled) {
  const sorted = [...iptw].sort((a, b) => a - b);
  const lo = quantile(sorted, 0.01), hi = quantile(sorted, 0.99);
  const pack = w => {
    const r = outcomeAnalysis(cohort, w);
    r.maxSmd = maxAbsSmd(cohort, w, pooled);
    return r;
  };
  return {
    trunc: pack(iptw.map(v => clamp(v, lo, hi))),
    trim: pack(iptw.map((v, i) => (ps[i] >= 0.1 && ps[i] <= 0.9 ? v : 0)))
  };
}

function analyze(cohort, keys, { km = false, truth = false, alternatives = false } = {}) {
  const model = fitPropensity(cohort, keys);
  const ps = cohort.map(p => predictPS(model, p));
  const logit = ps.map(e => Math.log(e / (1 - e)));
  const match = makeMatches(cohort, logit);
  const w = {
    raw: cohort.map(() => 1),
    psm: cohort.map((_, i) => (match.partner.has(i) ? 1 : 0)),
    iptw: ps.map((e, i) => (cohort[i].treated ? 1 / e : 1 / (1 - e))),
    ow: ps.map((e, i) => (cohort[i].treated ? 1 - e : e))
  };
  const pooled = pooledSds(cohort);
  const balance = {};
  METHODS.forEach(m => {
    balance[m] = {};
    COVARIATES.forEach(c => { balance[m][c.key] = smdFor(cohort, w[m], c.key, pooled[c.key]); });
  });
  const pairCluster = cohort.map((_, i) => (match.pairOf.has(i) ? match.pairOf.get(i) : -1 - i));
  const results = {};
  METHODS.forEach(m => {
    results[m] = outcomeAnalysis(cohort, w[m], { cluster: m === "psm" ? pairCluster : null, robust: m !== "raw", km });
    results[m].maxSmd = Math.max(...OUTCOME_KEYS.map(k => Math.abs(balance[m][k])));
  });
  const out = {
    cohort, keys, model, ps, logit, match, w, balance, results, pooled,
    cstat: cStatistic(ps, cohort.map(p => p.treated)),
    indexById: new Map(cohort.map((p, i) => [p.subject_id, i]))
  };
  if (truth) {
    out.truth = {
      psm: trueEffect(cohort, cohort.map((p, i) => (p.treated && match.partner.has(i) ? 1 : 0))),
      iptw: trueEffect(cohort, cohort.map(() => 1)),
      ow: trueEffect(cohort, cohort.map(p => p.truth.ps * (1 - p.truth.ps)))
    };
  }
  if (alternatives) out.alternatives = alternativeAnalyses(cohort, ps, w.iptw, pooled);
  return out;
}
