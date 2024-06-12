
export async function chatWithGroq(systemMessage: string, developerInput: string, userToken: string) {
	console.log('chatWithGroq' );
	const response = await fetch('http://localhost:8000/chat/groq/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Token ${userToken}`,
		},
		body: JSON.stringify({ systemMessage, developerInput }),
	});

	if (!response.ok) {
		console.log('Error while fetching response from server', response);
		throw new Error('Error while fetching response from server');
	}
  
	return await response.json();
}