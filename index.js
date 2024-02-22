const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const dotenv = require("dotenv");

dotenv.config();

const PRL_PATH = path.join(os.homedir(), ".prl");
const CREDS_PATH = path.join(PRL_PATH, "creds.json");
const PLAYGROUND_ENV = process.env.PLAYGROUND_ENV;

const getClientId = (inEurope) => {
  if (inEurope) {
    return "4asi3qr1jga1l1kvc6cqpqdsad";
  } else if (["LOCAL", "DEV"].includes(PLAYGROUND_ENV)) {
    return "59blf1klr2lejsd3uanpk3b0r4";
  } else {
    // Normal Prod user pool
    return "7r5tn1kic6i262mv86g6etn3oj";
  }
};

const login = async (email, password, inEurope) => {
  const region = inEurope ? "eu-north-1" : "us-east-1";
  const clientId = getClientId(inEurope);
  const cognitoUrl = `https://cognito-idp.${region}.amazonaws.com/`;

  try {
    const response = await axios.post(cognitoUrl, {
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
      ClientId: clientId,
    });

    const authDict = {
      refresh_token: response.data.AuthenticationResult.RefreshToken,
      access_token: response.data.AuthenticationResult.AccessToken,
      id_token: response.data.AuthenticationResult.IdToken,
      client_id: clientId,
      region: region,
      access_expiry:
        Math.floor(Date.now() / 1000) +
        response.data.AuthenticationResult.ExpiresIn -
        10,
    };

    await fs.ensureDir(PRL_PATH);
    await fs.writeJson(CREDS_PATH, authDict, { spaces: "\t" });
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
};

const getRegion = async () => {
  if (!(await fs.pathExists(CREDS_PATH))) {
    console.log("Not authenticated. Run the command: prl login.");
    return null;
  }

  const authDict = await fs.readJson(CREDS_PATH);
  return authDict.region;
};

const getAuthToken = async () => {
  if (!(await fs.pathExists(CREDS_PATH))) {
    console.log("Not authenticated. Run the command: prl login.");
    return null;
  }

  let authDict = await fs.readJson(CREDS_PATH);
  const currentTime = Math.floor(Date.now() / 1000);

  if (currentTime > authDict.access_expiry) {
    const cognitoUrl = `https://cognito-idp.${authDict.region}.amazonaws.com/`;

    try {
      const response = await axios({
        method: "post",
        url: cognitoUrl,
        data: {
          AuthFlow: "REFRESH_TOKEN_AUTH",
          AuthParameters: {
            REFRESH_TOKEN: authDict.refresh_token,
          },
          ClientId: authDict.client_id,
        },
        headers: {
          "Content-Type": "application/x-amz-json-1.1",
          "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
        },
      });

      // Access the response data correctly
      const authResult = response.data.AuthenticationResult;

      if (authResult && authResult.AccessToken && authResult.IdToken) {
        authDict = {
          ...authDict,
          access_token: authResult.AccessToken,
          id_token: authResult.IdToken,
          access_expiry:
            Math.floor(Date.now() / 1000) + authResult.ExpiresIn - 10,
        };

        await fs.writeJson(CREDS_PATH, authDict, { spaces: "\t" });
      } else {
        console.log(
          "Token refresh failed or the response format is unexpected."
        );
      }
    } catch (error) {
      console.log(
        "Your session has expired. Please run the command: prl login."
      );
      console.error(error);
      process.exit(1);
    }
  }

  return authDict.access_token;
};

module.exports = { login, getRegion, getAuthToken };
