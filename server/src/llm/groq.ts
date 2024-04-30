import { ChatGroq } from "@langchain/groq";

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
	console.log("API Key is not set in .env file");
	throw new Error("API Key is not set in .env file");
}

//  pricing : https://wow.groq.com/ (as of April 28, 2024)
const models = {
	gemma7: "gemma-7b-it", // $0.10/$0.10 per 1M tokens (input/output)
	llama3: "llama3-8b-8192", // $0.05/$0.10 per 1M tokens (input/output)
};

export const groqModel = new ChatGroq({
	apiKey: apiKey,
	model: models.gemma7,
	temperature: 1,
	maxTokens: 256,
});
