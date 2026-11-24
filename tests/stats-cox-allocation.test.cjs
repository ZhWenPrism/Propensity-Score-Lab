const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const inputs = [
  [1, 2, 2, 3, 4, 5, 5, 6, 7, 8, 9, 10],
  [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
  [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1],
  [1, 2, 0.5, 1, 1.5, 1, 2, 1, 0.75, 1, 1.25, 0.5],
  [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
];

function load() {
  let allocations = 0;
  const CountingArray = new Proxy(Array, {
    construct(target, args) {
      allocations++;
      return Reflect.construct(target, args);
    },
  });
  const context = vm.createContext({ Array: CountingArray });
  for (const file of ["sim.js", "stats.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
                    context, { filename: file });
  }
  const fit = vm.runInContext("coxFit", context);
  allocations = 0;
  return { fit, allocations: () => allocations };
}

test("model-based Cox fits do not allocate unused risk-set traces", () => {
  const model = load();
  assert.ok(model.fit(...inputs, false));
  assert.equal(model.allocations(), 0);
});

test("weighted tied-event fits retain model-based and clustered results", () => {
  const expected = [
    { beta: 0.11524194940124508, se: 0.744262253975246,
      hr: 1.1221449070180423, lo: 0.26092766167969905,
      hi: 4.825893829119081, p: 0.8769470507481169 },
    { beta: 0.11524194940124508, se: 0.5331168160566663,
      hr: 1.1221449070180423, lo: 0.3946851146610081,
      hi: 3.190414701674411, p: 0.8288580663669762 },
  ];
  for (const [position, robust] of [false, true].entries()) {
    const model = load();
    const actual = model.fit(...inputs, robust);
    assert.ok(actual);
    for (const key of Object.keys(expected[position])) {
      assert.ok(Math.abs(actual[key] - expected[position][key]) < 1e-12, key);
    }
    if (robust) assert.ok(model.allocations() > 0);
  }
});
