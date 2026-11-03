const test = require("node:test");
const assert = require("node:assert/strict");
const { twoSidedP } = require("./load-statistics.cjs")();

test("normal-tail probability is exactly one at zero", () => {
  assert.equal(twoSidedP(0), 1);
  for (const z of [0, 1e-12, -1e-12, 1, -1, 1.96, 8]) {
    assert.ok(twoSidedP(z) >= 0 && twoSidedP(z) <= 1);
  }
});

test("infinite test statistics have zero tail probability", () => {
  assert.equal(twoSidedP(Infinity), 0);
  assert.equal(twoSidedP(-Infinity), 0);
  assert.ok(Number.isNaN(twoSidedP(NaN)));
});

test("finite normal tails retain their numerical accuracy", () => {
  assert.ok(Math.abs(twoSidedP(1.96) - 0.04999579029644087) < 1e-7);
  assert.equal(twoSidedP(-1.96), twoSidedP(1.96));
});
