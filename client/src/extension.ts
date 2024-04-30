import * as path from "path";
import { workspace, ExtensionContext } from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

import { createGitRepository, getChangedLines } from "./utils";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join("server", "out", "server.js")
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		},
	};

	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: "file", language: "javascript" },
			{ scheme: "file", language: "typescript" },
			{ scheme: "file", language: "python" },
		],
		synchronize: {
			fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
		},
		middleware: {
			executeCommand: async (command, args, next) => {
				if (command === "extension.createRepository") {
					createGitRepository();
					return;
				} else if (command === "extension.getGitDiff") {
					try {
						const filePath = args[0];
						return getChangedLines(filePath);
					} catch (error) {
						console.error("Error getting git diff:", error);
					}
				}
				return next(command, args);
			},
		},
	};

	client = new LanguageClient(
		"whenInRome",
		"When In Rome",
		serverOptions,
		clientOptions
	);
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
