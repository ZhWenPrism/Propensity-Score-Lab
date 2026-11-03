const test = require("node:test");
const assert = require("node:assert/strict");
const { smdFor, pooledSds, loveSvg, lovePlotMax } = require("./load-statistics.cjs")();

test("constant separation is not reported as perfect balance", () => {
  const cohort = [{ treated: 1, female: 1 }, { treated: 1, female: 1 },
                  { treated: 0, female: 0 }, { treated: 0, female: 0 }];
  const pooled = pooledSds(cohort).female;
  assert.equal(pooled, 0);
  assert.ok(Number.isNaN(smdFor(cohort, [1, 1, 1, 1], "female", pooled)));
  cohort.forEach(p => { p.female = 0; });
  assert.equal(smdFor(cohort, [1, 1, 1, 1], "female", 0), 0);
});

test("a missing weighted treatment arm is not balanced", () => {
  const cohort = [{ treated: 1, x: 1 }, { treated: 0, x: 2 }];
  assert.ok(Number.isNaN(smdFor(cohort, [1, 0], "x", 1)));
});

test("estimable SMD values are preserved", () => {
  const cohort = [{ treated: 1, x: 1 }, { treated: 1, x: 3 },
                  { treated: 0, x: 0 }, { treated: 0, x: 2 }];
  assert.ok(Math.abs(smdFor(cohort, [1, 1, 1, 1], "x", Math.sqrt(2)) - 1 / Math.sqrt(2)) < 1e-12);
});

test("unestimable balance points do not produce invalid SVG coordinates", () => {
  const svg = loveSvg([{ name: "x", tag: "", inModel: true,
                        values: { raw: NaN, psm: .1, iptw: .2, ow: .3 } }], 1);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});


test("axis bounds ignore missing balance values", () => {
  assert.equal(lovePlotMax([{ values: { raw: NaN, psm: .1, iptw: .2, ow: .3 } }]), .4);
  assert.equal(lovePlotMax([{ values: { raw: NaN, psm: NaN, iptw: NaN, ow: NaN } }]), .4);
});
