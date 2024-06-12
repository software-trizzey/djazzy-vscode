

export async function chatWithGroq(systemMessage: string, developerInput: string, userToken: string) {
	try {
		const response = await fetch('http://localhost:8000/chat/groq/', {
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

		const responseData = await response.json();

		if (responseData.error) {
			console.error('Error while fetching response from server', responseData.error);
			throw new Error(`Error while fetching response from server: ${responseData.error}`);
		}

		return responseData;
	} catch (error: any) {
		console.error('Network error:', error.message);
		throw new Error(`Network error: ${error.message}`);
	}
  }
  