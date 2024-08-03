import { API_SERVER_URL } from '../constants/api';
import { handleErrorResponse, validateResponse } from './helpers';
import { ChatAPIResponse, DeveloperInput, LLMNPlusOneResult, Models } from './types';
import LOGGER from '../common/logs';

async function sendChatRequest(
    endpoint: string,
    systemMessage: string,
    developerInput: DeveloperInput | string,
    userToken: string
): Promise<ChatAPIResponse> {
    try {
        const response = await fetch(`${API_SERVER_URL}${endpoint}`, {
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
        
        if (typeof developerInput === 'object' && 'functionBody' in developerInput) {
            validateResponse(responseData, developerInput.functionBody);
        } else if (typeof developerInput === 'string') {
            validateResponse(responseData, developerInput);
        }

        return responseData;
    } catch (error: any) {
        LOGGER.error(`Error in API call to ${endpoint}: ${error.message}`);
        throw error; // Re-throw the error to be handled by the caller
    }
}

export async function chatWithGroq(
    systemMessage: string,
    developerInput: DeveloperInput | string,
    userToken: string
): Promise<ChatAPIResponse> {
    return sendChatRequest('/chat/groq/', systemMessage, developerInput, userToken);
}

export async function chatWithOpenAI(
    systemMessage: string,
    developerInput: DeveloperInput | string,
    userToken: string
): Promise<ChatAPIResponse> {
    return sendChatRequest('/chat/openai/', systemMessage, developerInput, userToken);
}

export const chatWithLLM = async (
    systemMessage: string,
    developerInput: DeveloperInput,
    userToken: string,
    modelId: Models = Models.GROQ
): Promise<LLMNPlusOneResult> => {
    try {
        let response: ChatAPIResponse;
        if (modelId === Models.GROQ) {
            response = await chatWithGroq(systemMessage, developerInput, userToken);
        } else if (modelId === Models.OPEN_AI) {
            response = await chatWithOpenAI(systemMessage, developerInput, userToken);
        } else {
            throw new Error('Invalid model specified');
        }

        return response as LLMNPlusOneResult;
    } catch (error: any) {
        if (error.name === 'RateLimitError') {
            LOGGER.warn(`Rate limit exceeded for user ${userToken}`);
        } else {
            LOGGER.error(`Error in chatWithLLM: ${error.message}`);
        }
        throw error;
    }
};