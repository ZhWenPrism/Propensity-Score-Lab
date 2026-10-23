"use strict";

// Synthetic two-arm trial used only to show why On-study and OT+7 windows can
// disagree when one arm stops treatment more often. Not roxadustat data.

function rngFrom(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cox model, one binary covariate, Breslow ties, optional strata; model-based SE.
function coxHR(time, event, x, strata) {
  const groups = new Map();
  time.forEach((_, i) => {
    const s = strata ? strata[i] : 0;
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(i);
  });
  const blocks = [...groups.values()].map(idx => {
    idx.sort((a, b) => time[a] - time[b]);
    const ties = [];
    for (const i of idx) {
      const last = ties[ties.length - 1];
      if (last && last.t === time[i]) last.m.push(i); else ties.push({ t: time[i], m: [i] });
    }
    return ties;
  });
  const evaluate = beta => {
    let U = 0, I = 0, ll = 0;
    const eb = Math.exp(beta);
    for (const ties of blocks) {
      let S0 = 0, S1 = 0;
      for (let g = ties.length - 1; g >= 0; g--) {
        let d = 0, dx = 0;
        for (const i of ties[g].m) {
          const r = x[i] ? eb : 1;
          S0 += r; S1 += r * x[i];
          if (event[i]) { d++; dx += x[i]; }
        }
        if (d) {
          const xbar = S1 / S0;
          U += dx - d * xbar;
          I += d * xbar * (1 - xbar);
          ll += beta * dx - d * Math.log(S0);
        }
      }
    }
    return { U, I, ll };
  };
  let beta = 0, cur = evaluate(0);
  for (let it = 0; it < 50 && cur.I > 1e-10; it++) {
    let step = Math.max(-3, Math.min(3, cur.U / cur.I)), next = evaluate(beta + step), k = 0;
    while (next.ll < cur.ll - 1e-10 && k++ < 30) { step /= 2; next = evaluate(beta + step); }
    beta += step; cur = next;
    if (Math.abs(step) < 1e-9) break;
  }
  const se = Math.sqrt(1 / cur.I);
  return { hr: Math.exp(beta), lo: Math.exp(beta - 1.96 * se), hi: Math.exp(beta + 1.96 * se) };
}

const SIM_DEFAULTS = {
  nPerArm: 3000, years: 2, pHigh: 0.3, rateLow: 0.03, rateHigh: 0.22,
  trueHR: 1.0, dropPlaHigh: 0.85, dropPlaLow: 0.45, dropRoxHigh: 0.35, dropRoxLow: 0.38, postMult: 1.0, stopMax: 1.0
};

function simulateTrial(params, seed) {
  const p = { ...SIM_DEFAULTS, ...params };
  const rand = rngFrom(seed);
  const expo = rate => -Math.log(Math.max(rand(), 1e-12)) / rate;
  const T = p.years, win = 7 / 365;
  const rows = [];
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < p.nPerArm; i++) {
      const high = rand() < p.pHigh;
      const base = high ? p.rateHigh : p.rateLow;
      const dropProb = arm ? (high ? p.dropRoxHigh : p.dropRoxLow) : (high ? p.dropPlaHigh : p.dropPlaLow);
      const stop = rand() < dropProb ? rand() * p.stopMax : Infinity;
      const onDrug = base * (arm ? p.trueHR : 1);
      const e1 = expo(onDrug);
      const t = e1 < stop ? e1 : stop + expo(base * p.postMult);
      rows.push({ arm, high, stop, t });
    }
  }
  const x = rows.map(r => r.arm), strata = rows.map(r => (r.high ? 1 : 0));
  const onStudyT = rows.map(r => Math.min(r.t, T)), onStudyE = rows.map(r => (r.t <= T ? 1 : 0));
  const w = rows.map(r => Math.min(r.stop + win, T));
  const otT = rows.map((r, i) => Math.min(r.t, w[i])), otE = rows.map((r, i) => (r.t <= w[i] ? 1 : 0));
  const completion = a => rows.filter(r => r.arm === a && r.stop === Infinity).length / p.nPerArm;
  const events = (E, a) => E.reduce((s, e, i) => s + (rows[i].arm === a ? e : 0), 0);
  return {
    params: p,
    completion: { rox: completion(1), pla: completion(0) },
    events: { onStudy: [events(onStudyE, 1), events(onStudyE, 0)], ot7: [events(otE, 1), events(otE, 0)] },
    onStudy: coxHR(onStudyT, onStudyE, x),
    ot7: coxHR(otT, otE, x),
    ot7Strat: coxHR(otT, otE, x, strata)
  };
}

// Repeat the trial to separate systematic bias from chance: point = geometric mean, range = min–max.
function simulateMany(params, firstSeed, reps = 10) {
  const runs = Array.from({ length: reps }, (_, i) => simulateTrial(params, firstSeed * 1000 + i));
  const summarise = key => {
    const hrs = runs.map(r => r[key].hr);
    return { hr: Math.exp(hrs.reduce((s, h) => s + Math.log(h), 0) / reps), lo: Math.min(...hrs), hi: Math.max(...hrs) };
  };
  const mean = f => runs.reduce((s, r) => s + f(r), 0) / reps;
  return {
    reps,
    completion: { rox: mean(r => r.completion.rox), pla: mean(r => r.completion.pla) },
    onStudy: summarise("onStudy"), ot7: summarise("ot7"), ot7Strat: summarise("ot7Strat")
  };
}
