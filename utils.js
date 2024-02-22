require("dotenv").config();
const { request, gql } = require("graphql-request");
const axios = require("axios");
const FormData = require("form-data");
import("inquirer")
  .then((inquirer) => {
    // You can use inquirer here
  })
  .catch((error) => {
    console.error("Failed to load inquirer:", error);
  });
const fs = require("fs/promises"); // For promise-based operations
const fsNonPromise = require("fs");
const path = require("path");
const { login, getAuthToken } = require("./index");
const { queryOpenAIGPT4 } = require("./query");
const ProgressBar = require("progress");

const PLAYGROUND_ENV = process.env.PLAYGROUND_ENV;

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { promisify } = require("util");
const writeFile = promisify(fs.writeFile);

function getRegion() {
  // Example function, replace with your actual logic to get the region
  return process.env.REGION || "us-west-2";
}

function beHost() {
  const region = getRegion();
  if (region === "eu-north-1") {
    return "https://europebe.playgroundrl.com";
  }
  if (PLAYGROUND_ENV === "LOCAL") {
    return "http://localhost:8000";
  }
  if (PLAYGROUND_ENV === "DEV") {
    return "https://devbe.playgroundrl.com";
  }

  return "https://prodbe.playgroundrl.com";
}

function feHost() {
  const region = getRegion();
  if (region === "eu-north-1") {
    return "https://eu.playgroundrl.com";
  }
  if (PLAYGROUND_ENV === "LOCAL") {
    return "http://localhost:3000";
  }
  if (PLAYGROUND_ENV === "DEV") {
    return "https://dev.playgroundrl.com";
  }

  return "https://playgroundrl.com";
}

const SCHEMA_PATH = path.join(__dirname, "jsonschemas");
const SUITE_SCHEMA_PATH = path.join(SCHEMA_PATH, "suiteschema.json");
const RUN_SCHEMA_PATH = path.join(SCHEMA_PATH, "run_params_schema.json");

async function getGraphQLClient() {
  const url = `${beHost()}/graphql/`;
  const headers = {
    Authorization: await getAuthToken(),
    "Content-Type": "application/json",
  };

  // Returning a configured request function for simplicity
  return (query, variables) => request(url, query, variables, headers);
}

async function listTestSuites() {
  const query = gql`
    query getTestSuites {
      testSuites {
        description
        id
        org
        title
        created
        creator
      }
    }
  `;

  const client = await getGraphQLClient();
  try {
    const data = await client(query);
    return data.testSuites;
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
}

async function getCSV(runId, filePath) {
  try {
    const url = `${beHost()}/export_results_to_file/?run_id=${runId}`;
    const authToken = await getAuthToken();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Received Error from Server: ${await response.text()}`);
    }

    const data = await response.buffer();
    await writeFile(filePath, data);

    console.log("Successfully downloaded the result CSV.");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1); // Exit in case of error
  }
}

async function pull(suiteId, includeId = false) {
  const client = await getGraphQLClient(); // Assuming getGraphQLClient() is already defined and returns a configured GraphQL client

  // Define the query for fetching test suite data
  const testSuiteQuery = gql`
    query getTestSuiteData($suiteId: String!) {
      testSuites(testSuiteId: $suiteId) {
        description
        id
        org
        title
        created
        globalChecks
      }
    }
  `;

  // Execute the query for the test suite
  let suiteResponse;
  try {
    suiteResponse = await client(testSuiteQuery, { suiteId });
  } catch (error) {
    throw new Error(`Unable to find test suite with id: ${suiteId}`);
  }

  if (suiteResponse.testSuites.length === 0) {
    throw new Error(`Unable to find test suite with id: ${suiteId}`);
  }

  const suite = suiteResponse.testSuites[0];
  const output = {
    title: suite.title,
    description: suite.description,
    tests: [],
  };

  // Define the query for fetching tests data
  const testsQuery = gql`
    query getTestData($suiteId: String!) {
      tests(testSuiteId: $suiteId) {
        checks
        testId
        inputUnderTest
        inputUnderTestType
        sampleOutput
        sampleOutputType
      }
    }
  `;

  // Execute the query for the tests
  const testsResponse = await client(testsQuery, { suiteId });
  const rawTests = testsResponse.tests;

  // Process and add the tests data to the output object
  rawTests.forEach((rawTest) => {
    const test = {};
    if (includeId) {
      test.id = rawTest.testId;
    }
    if (rawTest.inputUnderTestType === "file") {
      test.file_under_test = rawTest.inputUnderTest;
    } else {
      test.input_under_test = rawTest.inputUnderTest;
    }
    if (rawTest.sampleOutput !== "") {
      if (rawTest.sampleOutputType === "file") {
        test.file_fixed_output = rawTest.sampleOutput;
      } else {
        test.fixed_output = rawTest.sampleOutput;
      }
    }
    test.checks = JSON.parse(rawTest.checks); // Assuming checks is a JSON string that needs parsing
    output.tests.push(test);
  });

  // Return the JSON object instead of writing to a file
  return output;
}

async function processTestOutputs(testList) {
  const bar = new ProgressBar(
    ":bar :current/:total (:percent) :etas remaining",
    { total: testList.tests.length }
  );
  for (const test of testList.tests) {
    bar.tick();
    // Check if fixed_output already exists for this test

    // Ensure there is an input_under_test to process
    if (test.input_under_test !== undefined) {
      try {
        // Assuming queryOpenAIGPT4 is an async function that takes the input_under_test
        // and returns a response from OpenAI's GPT-4.
        const gptResponse = await queryOpenAIGPT4(test.input_under_test);

        // Update the fixed_output with the response from GPT-4
        test.fixed_output = gptResponse;
      } catch (error) {
        console.error(
          `Error processing test with input: ${test.input_under_test}`,
          error
        );
        // Handle the error as needed
      }
    }
  }
  try {
    await fs.writeFile("temp.json", JSON.stringify(testList, null, 2), "utf8");
    console.log("Successfully written to temp.json");
  } catch (error) {
    console.error("Error writing to temp.json:", error);
  }

  // Since testList is modified directly, return it for clarity or further processing
  return testList;
}

async function uploadFile(suiteId, filePath) {
  try {
    const authToken = await getAuthToken(); // Ensure you have the auth token
    const formData = new FormData();
    formData.append("file", fsNonPromise.createReadStream(filePath));

    const response = await axios.post(
      `${beHost()}/upload_file/?test_suite_id=${suiteId}`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: authToken,
        },
      }
    );

    return response.data["file_id"];
  } catch (error) {
    console.error(error);
    throw new Error(`Failed to upload file ${filePath}`);
  }
}

async function addBatchToSuite(batch) {
  const mutation = gql`
    mutation addBatchTests {
      batchUpdateTest(
        tests: [
          ${batch.map((test) => `${test}`).join(",")}
        ]
      ) {
        tests {
          testId
        }
      }
    }
  `;

  const client = await getGraphQLClient();

  try {
    const response = await client(mutation);
    const tests = response.batchUpdateTest.tests;
    return tests.map((test) => test.testId);
  } catch (error) {
    console.error("Error adding batch to suite:", error);
    throw error;
  }
}

async function addTests(data, files, suiteId) {
  let testIds = [];
  let batch = [];
  let i = 0;

  for (let test of data.tests) {
    let inputUnderTest, inputUnderTestType;
    let fixedOutput, fixedOutputType;

    // Handling the input under test
    if ("file_under_test" in test) {
      let filePath = test.file_under_test;
      inputUnderTest = files[filePath];
      inputUnderTestType = "file";
    } else {
      inputUnderTest = test.input_under_test;
      inputUnderTestType = "raw";
    }

    // Handling checks (double JSON.stringify to mimic the original Python's json.dumps)
    let checks = JSON.stringify(JSON.stringify(test.checks));

    // Handling fixed output
    if ("fixed_output" in test) {
      fixedOutput = test.fixed_output;
      fixedOutputType = "raw";
    } else if ("file_fixed_output" in test) {
      fixedOutput = files[test.file_fixed_output];
      fixedOutputType = "file";
    } else {
      fixedOutput = "";
      fixedOutputType = "raw";
    }

    // Adding to batch, making sure to stringify the entire object
    batch.push(`
    {
        sampleOutput: ${JSON.stringify(fixedOutput)},
        sampleOutputType: "${fixedOutputType}",
        checks: ${checks}, 
        inputUnderTest: ${JSON.stringify(inputUnderTest)}, 
        inputUnderTestType: "${inputUnderTestType}",
        testSuiteId: "${suiteId}"
    }`);

    i++;
    if (i % 100 === 0) {
      let newIds = await addBatchToSuite(batch); // Assuming this is an async function
      testIds = testIds.concat(newIds);
      batch = [];
    }
  }

  if (batch.length !== 0) {
    let newIds = await addBatchToSuite(batch); // Assuming this is an async function
    testIds = testIds.concat(newIds);
  }

  // Preparing the test ID list for the GraphQL mutation
  let testIdList = testIds.map((testId) => `"${testId}"`).join(", ");
  let query = gql`
        mutation removeOldTests {
          removeUnusedTests(
              testSuiteId: "${suiteId}",
              inUseTests: [${testIdList}]
            ) {
                success
            }
        }
    `;

  // Execute the query
  let client = await getGraphQLClient();
  let response = await client(query);
  return response;
}

const id = "cff80448-7189-471c-ae65-68e392b8036e";

let jsondata;

(async () => {
  jsondata = await processTestOutputs(await pull(id));
  //   uploadFile(id, "temp.json").then((data) => {
  //     console.log("File uploaded with id:", data);
  //   });

  addTests(jsondata, { "temp.json": "temp.json" }, id).then((data) => {
    console.log("Tests added:", data);
  });
})();
