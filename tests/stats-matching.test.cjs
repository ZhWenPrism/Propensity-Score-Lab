const assert = require("node:assert/strict");
const test = require("node:test");
const { makeMatches } = require("./load-statistics.cjs")();

function exhaustive(cohort, logits) {
  const mean = logits.reduce((a, b) => a + b, 0) / logits.length;
  const variance = logits.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, logits.length - 1);
  const caliper = 0.2 * Math.sqrt(variance), candidates = [];
  cohort.forEach((row, t) => {
    if (!row.treated) return;
    cohort.forEach((other, c) => {
      const distance = Math.abs(logits[t] - logits[c]);
      if (!other.treated && distance <= caliper + 1e-12) candidates.push([distance, t, c]);
    });
  });
  candidates.sort((a, b) => a[0] - b[0] || cohort[a[1]].subject_id - cohort[b[1]].subject_id
                            || cohort[a[2]].subject_id - cohort[b[2]].subject_id);
  const used = new Set(), pairs = [];
  for (const [distance, t, c] of candidates) {
    if (used.has(t) || used.has(c)) continue;
    used.add(t); used.add(c); pairs.push([t, c, distance]);
  }
  return pairs;
}

test("caliper search retains greedy pair selection and tie ordering", () => {
  for (let seed = 0; seed < 30; seed++) {
    const cohort = Array.from({ length: 61 }, (_, i) => ({ treated: (i + seed) % 3 === 0 ? 1 : 0, subject_id: seed % 2 ? 1000 - i : Math.floor(i / 4) }));
    const logits = cohort.map((_, i) => ((i * 17 + seed * 11) % 47) / 10);
    const result = makeMatches(cohort, logits);
    assert.deepEqual(Array.from(result.pairs, p => Array.from(p)), exhaustive(cohort, logits));
    for (let i = 0; i < result.pairs.length; i++) {
      const [t, c, d] = result.pairs[i];
      assert.equal(result.partner.get(t), c);
      assert.equal(result.partner.get(c), t);
      assert.equal(result.distance.get(t), d);
      assert.equal(result.pairOf.get(t), i);
    }
  }
});

test("constant logits and absent treatment arms retain their results", () => {
  for (const treated of [[1, 0, 1, 0], [1, 1, 1, 1], [0, 0, 0, 0]]) {
    const cohort = treated.map((t, i) => ({ treated: t, subject_id: i }));
    const logits = [0, 0, 0, 0];
    assert.deepEqual(Array.from(makeMatches(cohort, logits).pairs, p => Array.from(p)), exhaustive(cohort, logits));
  }
});

test("disjoint propensity ranges avoid scanning every treatment-control pair", () => {
  const cohort = Array.from({ length: 3000 }, (_, i) => ({ treated: i < 1500 ? 1 : 0, subject_id: i }));
  const values = cohort.map(row => row.treated ? -1 : 1);
  let reads = 0;
  const logits = new Proxy(values, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) reads++;
      return Reflect.get(target, key, receiver);
    }
  });
  assert.equal(makeMatches(cohort, logits).pairs.length, 0);
  assert.ok(reads < 150000, "candidate search should skip controls outside the caliper");
});
