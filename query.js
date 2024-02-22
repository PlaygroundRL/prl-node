// If you're using Node.js, you'll need to import fetch from 'node-fetch'
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Assuming OPEN_AI_KEY is stored in your environment variables
const OPEN_AI_KEY = process.env.OPEN_AI_KEY;

// Function to query OpenAI GPT-4
async function queryOpenAIGPT4(prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPEN_AI_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4", // Specify the model you want to use
      messages: [
        {
          role: "system",
          content: "",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  // Assuming you want to return the text of the first choice
  return data.choices[0].message.content.trim();
}

// Example usage:
// Make sure to call this in an async context or use .then() syntax
// queryOpenAIGPT4("Hello! How are you?").then(console.log).catch(console.error);

module.exports = { queryOpenAIGPT4 };
