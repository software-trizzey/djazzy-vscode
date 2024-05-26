import { ChatGroq } from "@langchain/groq";
import { MAX_TOKENS, systemMessageWithJsonResponse } from "../constants/chat";

//  pricing : https://wow.groq.com/ (as of April 28, 2024)
const models = {
	gemma7: "gemma-7b-it", // $0.10/$0.10 per 1M tokens (input/output)
	llama3: "llama3-8b-8192", // $0.05/$0.10 per 1M tokens (input/output)
};

// FIXME: create a new api key after beta
export const groqModel = new ChatGroq({
	apiKey: "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",
	model: models.gemma7,
	temperature: 1,
	maxTokens: MAX_TOKENS,
});

export async function chatWithGroq(developerInput: string) {
	const response = await groqModel.invoke(
		[
			["system", systemMessageWithJsonResponse],
			["human", developerInput],
		],
		{
			response_format: { type: "json_object" },
		}
	);

	if (!response || !response.content) {
		console.log("Error while fetching response from LLM", response);
		throw new Error("Error while fetching response from LLM");
	}

	return response.content;
}
