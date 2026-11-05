const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

module.exports = function loadStatistics() {
  const context = vm.createContext({});
  for (const file of ["sim.js", "stats.js", "charts.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  return vm.runInContext("({ twoSidedP, smdFor, pooledSds, loveSvg, lovePlotMax, makeMatches })", context);
};
