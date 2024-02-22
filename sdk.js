const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const ProgressBar = require("progress");
const { addTests, pull } = require("./utils.js");
const { _run } = require("./run.js");

function parseTestSuiteIdFromUrl(testSuiteUrl) {
  const startIndex =
    testSuiteUrl.indexOf("test_suite_id=") + "test_suite_id=".length;
  return testSuiteUrl.substring(startIndex);
}

// function that takes a user's custom function and runs it on a test suite
async function runEvaluations(
  testSuiteUrl,
  generateFn,
  description = "Ran automatically using the PRL SDK",
  maximumThreads = 4,
  verbosity = 1,
  modelUnderTest = "sdk"
) {
  suiteId = parseTestSuiteIdFromUrl(testSuiteUrl);

  // pull the testSuiteUrl suite
  let testList = await pull(suiteId);

  // run the generateFn on each test
  const bar = new ProgressBar(
    ":bar :current/:total (:percent) :etas remaining",
    { total: testList.tests.length }
  );
  for (const test of testList.tests) {
    bar.tick();
    // Ensure there is an input_under_test to process
    if (test.input_under_test !== undefined) {
      try {
        const modelResponse = await generateFn(test.input_under_test);
        test.fixed_output = modelResponse;
      } catch (error) {
        console.error(
          `Error processing test with input: ${test.input_under_test}`,
          error
        );
      }
    }
  }

  // update the test suite
  addTests(testList, {}, suiteId).then((data) => {
    console.log("Tests added", data);
  });

  // Run isn't quite working yet
  /*
  run_url = _run(
    {
      use_fixed_output: true,
      description: description,
      maximum_threads: maximumThreads,
      //   model_under_test: modelUnderTest,
    },
    suiteId,
    {}
  );
  */
}

module.exports = {
  runEvaluations,
};
