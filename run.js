const fs = require("fs");
const axios = require("axios");
const { validate } = require("jsonschema");

const { beHost, feHost } = require("./utils.js");
const { getAuthToken } = require("./auth");

async function _run(run_config, suiteid, metadata_map = null) {
  try {
    // TODO: do the same validation we do in the Python SDK for the run_config provided
    // const schema = JSON.parse(fs.readFileSync(RUN_SCHEMA_PATH, "utf8"));
    // validate(run_config, schema);
  } catch (e) {
    if (e.name === "ValidationError") {
      throw new Error(
        `Config file provided did not conform to JSON schema. Message: ${e.message}`
      );
    } else {
      throw e; // Rethrow if it's not a validation error
    }
  }

  let body = { test_suite_id: suiteid, parameters: run_config };
  if (metadata_map !== null) {
    body.metadata = metadata_map;
  }

  try {
    const response = await axios.post(`${beHost()}/start_run/`, body, {
      headers: { Authorization: getAuthToken() },
    });

    if (response.status === 200) {
      const run_id = response.data.run_id;
      return `${feHost()}/results?run_id=${run_id}`;
    } else {
      throw new Error(
        `Could not start run. Received error from server: ${response.statusText}`
      );
    }
  } catch (error) {
    if (error.response) {
      throw new Error(
        `Could not start run. Received error from server: ${error.response.data}`
      );
    } else {
      throw new Error(`Could not start run. Error: ${error.message}`);
    }
  }
}

module.exports = { _run };
