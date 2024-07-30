import { API_SERVER_URL } from '../constants/api';
import { handleErrorResponse } from './helpers';
import { ChatAPIResponse } from './types';

export async function chatWithOpenAI(systemMessage: string, developerInput: string, userToken: string): Promise<ChatAPIResponse> {
	try {
		const response = await fetch(`${API_SERVER_URL}/chat/openai/`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Token ${userToken}`,
			},
			body: JSON.stringify({ systemMessage, developerInput }),
		});

		if (!response.ok) {
			await handleErrorResponse(response);
		}

		const responseData: ChatAPIResponse = await response.json();
		return responseData;
	} catch (error: any) {
		console.error(error.message);
		throw new Error(error.message);
	}
}
