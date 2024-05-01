import * as path from "path";
import { exec } from "child_process";
import { workspace, window, ExtensionContext } from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

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
						return await getChangedLines(filePath);
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

export function getChangedLines(filePath: string): Promise<Set<number>> | null {
	return new Promise((resolve, reject) => {
		exec(
			`git diff HEAD -U0 -- ${filePath}`,
			{ cwd: workspace.rootPath },
			(error: any, stdout: any, stderr: any) => {
				if (error) {
					console.error("Error getting git diff:", stderr);
					reject(`Error fetching changes: ${stderr}`);
					return;
				}
				const changedLines = parseDiff(stdout);
				resolve(changedLines);
			}
		);
	});
}

export function createGitRepository() {
	const terminal = window.createTerminal({
		name: "Initialize Git Repository",
	});
	terminal.show();
	terminal.sendText("git init");
	terminal.sendText("echo # Initialize repository > README.md");
	terminal.sendText("git add README.md");
	terminal.sendText("git commit -m 'Initial commit'");
	terminal.sendText("echo .gitignore");
	terminal.sendText("echo node_modules > .gitignore");
}

/**
 * Parse the diff output to get the changed lines in the file.
 */
function parseDiff(diffOutput: string): Set<number> {
	const changedLines = new Set<number>();
	const regex = /^@@ -\d+,\d+ \+(\d+),(\d+) @@/gm;
	let match;

	while ((match = regex.exec(diffOutput)) !== null) {
		const startLine = parseInt(match[1], 10);
		const lineCount = parseInt(match[2], 10);

		// Add all lines in this chunk to the set of changed lines
		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			changedLines.add(startLine + lineIndex);
		}
	}

	return changedLines;
}
