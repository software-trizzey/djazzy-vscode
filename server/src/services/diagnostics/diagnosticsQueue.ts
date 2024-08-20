import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';


export class DiagnosticQueue {
	private queues: Map<string, Promise<Diagnostic[]>> = new Map();
  
	async queueDiagnosticRequest(
		document: TextDocument,
		diagnosticFunction: (document: TextDocument) => Promise<Diagnostic[]>
	): Promise<Diagnostic[]> {
		const uri = document.uri;

		const diagnosticPromise = (async () => {
			await this.queues.get(uri);
			return await diagnosticFunction(document);
		})();

		// Replace any existing promise in the queue with this new one
		this.queues.set(uri, diagnosticPromise);
		return await diagnosticPromise;
	}

	clearQueue(uri: string) {
		this.queues.delete(uri);
	}
}