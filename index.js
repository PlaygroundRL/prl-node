const { addTests, processTestOutputs, pull } = require("./utils.js");

const id = "cff80448-7189-471c-ae65-68e392b8036e";

let jsondata;

(async () => {
  jsondata = await processTestOutputs(await pull(id));
  console.log("Tests pulled:", jsondata);
  console.log("Adding tests...");
  addTests(jsondata, { "temp.json": "temp.json" }, id).then((data) => {
    console.log("Tests added", data);
  });
})();
