import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
	console.log("API Key is not set in .env file");
	throw new Error("API Key is not set in .env file");
}

const modelName = "gpt-3.5-turbo"; // $0.50/$1.50 per 1M tokens (input/output)

export const openAIModel = new ChatOpenAI({
	model: modelName,
	maxTokens: 256,
	apiKey: apiKey,
}).bind({
	response_format: {
		type: "json_object",
	},
});
