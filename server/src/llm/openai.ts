import { ChatOpenAI } from "@langchain/openai";
import { MAX_TOKENS, systemMessageWithJsonResponse } from "../constants/chat";
import LOGGER from "../common/logs";

const modelName = "gpt-3.5-turbo"; // $0.50/$1.50 per 1M tokens (input/output)

// FIXME: create a new api key after beta
export const openAIModel = new ChatOpenAI({
	model: modelName,
	maxTokens: MAX_TOKENS,
	apiKey: "sk-proj-sSGRDSuOaXIvL8aucA9AT3BlbkFJQHvR9z2WemH0uEaQrGxa",
}).bind({
	response_format: {
		type: "json_object",
	},
});

export async function chatWithOpenAI(developerInput: string) {
	try {
		const response = await openAIModel.invoke([
			["system", systemMessageWithJsonResponse],
			["human", developerInput],
		]);
		if (!response || !response.content) {
			console.log("Error while fetching response from OpenAI", response);
			throw new Error("Error while fetching response from OpenAI");
		}
		return response.content;
	} catch (error: any) {
		LOGGER.error(error);
	}
}
