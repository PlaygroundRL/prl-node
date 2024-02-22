const { addTests, processTestOutputs, pull } = require("./utils.js");

// http://localhost:3000/view?test_suite_id=786f16ad-c48a-45a3-839e-e30d8119597f
const id = "786f16ad-c48a-45a3-839e-e30d8119597f";

let jsondata;

(async () => {
  jsondata = await processTestOutputs(await pull(id));
  console.log("Tests pulled:", jsondata);
  console.log("Adding tests...");
  addTests(jsondata, { "temp.json": "temp.json" }, id).then((data) => {
    console.log("Tests added", data);
  });
})();
