"use strict";

const N = 360;
const FOLLOW_UP = 28;
const TRUE_LOG_HR = -0.45;
const WEIBULL_SHAPE = 0.75;
const BASE_RATE = 0.022;
const INSTRUMENT_LOGIT = 1.5;
const SCENARIOS = { mild: 0.35, moderate: 0.75, strong: 1.25 };

const COVARIATES = [
  { key: "age", name: "年龄", unit: "岁", source: "patients.anchor_age", role: "confounder", digits: 0 },
  { key: "female", name: "女性", source: "patients.gender", role: "confounder", binary: true },
  { key: "sofa", name: "SOFA", source: "derived · 治疗前", role: "confounder", digits: 0 },
  { key: "map", name: "MAP", unit: "mmHg", source: "chartevents · 治疗前", role: "confounder", digits: 0 },
  { key: "lactate", name: "乳酸", unit: "mmol/L", source: "labevents · 治疗前", role: "confounder", digits: 1 },
  { key: "creatinine", name: "肌酐", unit: "mg/dL", source: "labevents · 治疗前", role: "confounder", digits: 2 },
  { key: "pref", name: "医疗组偏好去甲", source: "合成 · 主治医疗组", role: "instrument", binary: true },
  { key: "malignancy", name: "合并恶性肿瘤", source: "合成 · diagnoses_icd", role: "prognostic", binary: true }
];
const ROLE_LABEL = { confounder: "混杂因素", instrument: "只影响治疗", prognostic: "只影响结局" };
const DEFAULT_KEYS = ["age", "female", "sofa", "map", "lactate", "creatinine"];
const OUTCOME_KEYS = COVARIATES.filter(c => c.role !== "instrument").map(c => c.key);

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

// Weibull proportional hazards: H(t) = BASE_RATE · t^k · exp(lp + β·a)
const eventTime = (lp, a, u) => Math.pow(-Math.log(u) / (BASE_RATE * Math.exp(lp + TRUE_LOG_HR * a)), 1 / WEIBULL_SHAPE);
const risk28 = (lp, a) => 1 - Math.exp(-BASE_RATE * Math.pow(FOLLOW_UP, WEIBULL_SHAPE) * Math.exp(lp + TRUE_LOG_HR * a));

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
    const pref = rng.random() < 0.5 ? 1 : 0;
    const malignancy = rng.random() < 0.2 ? 1 : 0;
    const sofaZ = (sofa - 6) / 3, mapZ = (map - 69) / 10;
    const lactateZ = (lactate - 2.2) / 1.2, creatinineZ = (creatinine - 1.2) / 0.6;
    const truePs = logistic(-0.35 + scale * (0.22 * ageZ + 0.78 * sofaZ - 0.62 * mapZ + 0.42 * lactateZ + 0.14 * creatinineZ + 0.08 * (female - 0.44)) + INSTRUMENT_LOGIT * (pref - 0.5));
    const treated = rng.random() < truePs ? 1 : 0;
    const lp = 0.28 * ageZ + 0.42 * sofaZ - 0.19 * mapZ + 0.23 * lactateZ + 0.12 * creatinineZ + 0.1 * female + 0.85 * malignancy;
    const observed = eventTime(lp, treated, Math.max(rng.random(), 1e-12));
    const death = observed <= FOLLOW_UP ? 1 : 0;
    const month = String(1 + Math.floor(rng.random() * 12)).padStart(2, "0");
    const day = String(1 + Math.floor(rng.random() * 28)).padStart(2, "0");
    const hour = String(Math.floor(rng.random() * 24)).padStart(2, "0");
    rows.push({
      subject_id: 91000001 + i, hadm_id: 92000001 + i, stay_id: 93000001 + i,
      gender: female ? "F" : "M", female, age, sofa, map, lactate, creatinine, pref, malignancy, treated,
      death, time: death ? Math.max(0.1, Math.ceil(observed * 10) / 10) : FOLLOW_UP,
      admission_type: rng.random() < 0.78 ? "EMERGENCY" : "URGENT",
      first_careunit: ["MICU", "SICU", "TSICU"][Math.floor(rng.random() * 3)],
      intime: `2153-${month}-${day} ${hour}:00`,
      truth: { ps: truePs, lp, risk1: risk28(lp, 1), risk0: risk28(lp, 0) }
    });
  }
  return rows;
}
