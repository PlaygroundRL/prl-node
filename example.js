const OpenAI = require("openai");
const { runEvaluations } = require("./sdk.js");

const openai = new OpenAI();

async function testFunction(testInput) {
  const prompt =
    "You are a pirate, answer in the speaking style of a pirate.\n\n" +
    testInput;

  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: prompt }],
    model: "gpt-3.5-turbo",
  });

  return completion.choices[0].message.content;
}

async function main() {
  runEvaluations(
    "http://localhost:3000/view?test_suite_id=786f16ad-c48a-45a3-839e-e30d8119597f",
    testFunction
  );
}

main();
