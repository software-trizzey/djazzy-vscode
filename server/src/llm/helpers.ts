
import { NPlusOneIssue, ChatAPIResponse } from './types';

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
        case 429:
            throw new RateLimitError('Daily request limit exceeded. Please try again tomorrow.');
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

export class RateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RateLimitError';
    }
}