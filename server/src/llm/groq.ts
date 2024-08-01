import { API_SERVER_URL } from '../constants/api';
import { handleErrorResponse } from './helpers';
import { ChatAPIResponse } from './types';

export async function chatWithGroq(systemMessage: string, developerInput: string, userToken: string): Promise<ChatAPIResponse>  {
	try {
		const response = await fetch(`${API_SERVER_URL}/chat/groq/`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ systemMessage, developerInput, apiKey: userToken }),
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
