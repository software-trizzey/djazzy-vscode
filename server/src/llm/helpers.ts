import LOGGER from '../common/logs';
import { chatWithGroq } from './groq';
import { chatWithOpenAI } from './openai';
import { NPlusOneIssue, ChatAPIResponse, LLMNPlusOneResult, Models, DeveloperInput } from './types';

export async function handleErrorResponse(response: Response): Promise<void> {
	let errorMessage = `Error: ${response.statusText}`;
	try {
		const errorData = await response.json();
		if (errorData.error) {
			errorMessage = `Error: ${errorData.error}`;
		}
	} catch (jsonError) {
		console.error('Error parsing JSON error response:', jsonError);
	}

	switch (response.status) {
		case 400:
			errorMessage = 'Invalid input. Please check your input and try again.';
			break;
		case 401:
			errorMessage = 'Unauthorized request. Please log in again.';
			break;
		case 500:
			errorMessage = 'Internal server error. Please try again later.';
			break;
		default:
			errorMessage = `Unexpected error: ${response.statusText}`;
	}
	console.error(`HTTP error ${response.status}: ${errorMessage}`);
	throw new Error(errorMessage);
}

export function validateResponse(responseData: ChatAPIResponse, originalInput: string): void {
	if (typeof responseData.has_n_plus_one_issues !== 'boolean' || !Array.isArray(responseData.issues)) {
		console.error('Unexpected response structure:', responseData);
		throw new Error('Unexpected response structure from server');
	}

	const validatedIssues = responseData.issues.filter((issue: NPlusOneIssue) =>
		originalInput.includes(issue.problematic_code)
	);

	responseData.has_n_plus_one_issues = validatedIssues.length > 0;
	responseData.issues = validatedIssues;
}

export const chatWithLLM = async (
	systemMessage: string,
	developerInput: DeveloperInput,
	userToken: string,
	modelId: Models = Models.GROQ
): Promise<LLMNPlusOneResult> => {
	try {
		let response = null;
		if (modelId === Models.GROQ) {
			response = await chatWithGroq(systemMessage, developerInput, userToken);
		} else if (modelId === Models.OPEN_AI) {
			response = await chatWithOpenAI(systemMessage, developerInput, userToken);
		}
		return response as LLMNPlusOneResult;
	} catch (error: any) {
		LOGGER.error(error.message);
		throw new Error(error.message);
	}
};