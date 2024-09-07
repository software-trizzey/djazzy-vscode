import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, CancellationTokenSource } from 'vscode-languageserver/node';

export class DiagnosticQueue {
	private queues: Map<string, { promise: Promise<Diagnostic[]>, cancelToken: CancellationTokenSource }> = new Map();

	async queueDiagnosticRequest(
		document: TextDocument,
		diagnosticFunction: (document: TextDocument) => Promise<Diagnostic[]>
	): Promise<Diagnostic[]> {
		const uri = document.uri;

		const existingRequest = this.queues.get(uri);
		if (existingRequest) {
			existingRequest.cancelToken.cancel();  // Cancel outdated request
		}

		const cancelToken = new CancellationTokenSource();

		const diagnosticPromise = (async () => {
			await existingRequest?.promise;

			if (!cancelToken.token.isCancellationRequested) {
				return await diagnosticFunction(document);
			}

			return [];
		})();

		this.queues.set(uri, { promise: diagnosticPromise, cancelToken });

		return await diagnosticPromise;
	}

	clearQueue(uri: string) {
		const existingRequest = this.queues.get(uri);
		if (existingRequest) {
			existingRequest.cancelToken.cancel();
		}
		this.queues.delete(uri);
	}
}