import { ChatOpenAI } from "@langchain/openai";

const modelName = "gpt-3.5-turbo"; // $0.50/$1.50 per 1M tokens (input/output)

export const openAIModel = new ChatOpenAI({
	model: modelName,
	maxTokens: 256,
	apiKey: process.env.OPENAI_API_KEY,
}).bind({
	response_format: {
		type: "json_object",
	},
});
