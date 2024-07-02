import { API_SERVER_URL } from '../constants/api';

interface OpenAIResponse {
  has_n_plus_one_issues: boolean;
  issues: Array<{
    description: string;
    suggestion: string;
    original_code_snippet: string;
    code_snippet_fix: string;
  }>;
}

export async function chatWithOpenAI(systemMessage: string, developerInput: string, userToken: string): Promise<OpenAIResponse> {
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
          errorMessage = errorMessage || 'Invalid input. Please check your input and try again.';
          break;
        case 401:
          errorMessage = errorMessage || 'Unauthorized request. Please log in again.';
          break;
        case 500:
          errorMessage = errorMessage || 'Internal server error. Please try again later.';
          break;
        default:
          errorMessage = errorMessage || `Unexpected error: ${response.statusText}`;
      }
      console.error(`HTTP error ${response.status}: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    const responseData: OpenAIResponse = await response.json();

    if (typeof responseData.has_n_plus_one_issues !== 'boolean' || !Array.isArray(responseData.issues)) {
      console.error('Unexpected response structure:', responseData);
      throw new Error('Unexpected response structure from server');
    }

	const validatedResponse = validateOpenAIResponse(responseData, developerInput);
    return validatedResponse;
  } catch (error: any) {
    console.error(error.message);
    throw new Error(error.message);
  }
}

function validateOpenAIResponse(response: OpenAIResponse, originalInput: string): OpenAIResponse {
	const validatedIssues = response.issues.filter(issue => 
		originalInput.includes(issue.original_code_snippet)
	);

	return {
		has_n_plus_one_issues: validatedIssues.length > 0,
		issues: validatedIssues
	};
}