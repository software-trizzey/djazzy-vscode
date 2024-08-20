import { Connection, MessageType } from 'vscode-languageserver/node';
import LOGGER from '../../common/logs';


export class ErrorHandler {
    private connection: Connection;

    constructor(connection: Connection) {
        this.connection = connection;
    }

	public handleError(error: Error) {
		const message = error?.message || error.toString();

		if (error.toString().includes("Could not access 'HEAD'")) {
			const actionText = "Create Repository";
			const params = {
				type: MessageType.Error,
				message:
					"Failed to find Git Repository. Please create a git repository to continue using the extension.",
				actions: [
					{ title: actionText }, // MessageActionItem
				],
			};

			// https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#messageType
			this.connection.sendRequest("Error", params).then((selectedAction) => {
				if (selectedAction === actionText) {
					console.log("Creating repository");
					// Trigger the client-side command to create the repository
					this.connection.sendRequest("workspace/executeCommand", {
						command: "extension.createRepository",
					});
				}
			});
		} else if (
			message.includes("SyntaxError") ||
			message.includes("IndentationError") ||
			message.includes("Unexpected token")
		) {
			// djangoly-ignore we're not worried about syntax errors triggered by the user's code
			return;
		} else {
			console.log(error);
			LOGGER.error(error);
		}
	}
}