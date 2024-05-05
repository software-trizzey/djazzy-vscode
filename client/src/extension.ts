import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import * as vscode from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
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

	const apiFolders = await vscode.workspace.findFiles(
		"**/{api,views}/*",
		"**/node_modules/**"
	);
	const apiFolderWatchers = apiFolders.map((uri) => {
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(uri, "**/*")
		);
		watcher.onDidChange(checkAndNotify);
		watcher.onDidCreate(checkAndNotify);
		context.subscriptions.push(watcher);
		return watcher;
	});

	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: "file", language: "javascript" },
			{ scheme: "file", language: "typescript" },
			{ scheme: "file", language: "python" },
		],
		synchronize: {
			fileEvents: apiFolderWatchers,
		},
		middleware: {
			executeCommand: async (command, args, next) => {
				// FIXME: probably won't work. Convert to listener like one for changedLines
				if (command === "whenInRome.createRepository") {
					createGitRepository();
					return;
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

	client.start().then(() => {
		client.onRequest("whenInRome.getGitDiff", getChangedLines);
	});

	function checkAndNotify(uri: vscode.Uri) {
		// Throttle notifications
		const lastNotified = getLastNotifiedTime(uri);
		const currentTime = new Date().getTime();
		if (currentTime - lastNotified > getNotificationInterval()) {
			const relativePath = vscode.workspace.asRelativePath(uri);
			vscode.window.showWarningMessage(
				`Ensure you've tested the changes in ${relativePath}`,
				"Ok"
			);
			updateLastNotifiedTime(uri, currentTime);
		}
	}
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

/** Git utils */
async function getChangedLines(originalFilePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const uri = vscode.Uri.parse(originalFilePath);
		const filePath = uri.fsPath;
		const relativeFilePath = path.relative(vscode.workspace.rootPath, filePath);
		exec(
			`git ls-files --others --exclude-standard ${relativeFilePath}`,
			{ cwd: vscode.workspace.rootPath },
			(error, stdout, stderr) => {
				if (error) {
					console.error("Error checking file status:", stderr);
					reject(`Error checking file status: ${stderr}`);
					return;
				}

				if (stdout.trim()) {
					console.log("File is untracked:", relativeFilePath);
					// File is untracked, so consider all lines as changed
					const allLinesChanged = new Set<number>();
					const data = fs.readFileSync(
						path.join(vscode.workspace.rootPath, relativeFilePath),
						"utf8"
					);
					const lines = data.split("\n");
					for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
						allLinesChanged.add(lineIndex + 1); // Line numbers are 1-based
					}
					const serializedLineData = JSON.stringify(
						Array.from(allLinesChanged)
					);
					resolve(serializedLineData);
				} else {
					// File is tracked, use git diff to find changed lines
					console.log("File is tracked:", relativeFilePath);
					exec(
						`git diff HEAD -U0 -- ${relativeFilePath}`,
						{ cwd: vscode.workspace.rootPath },
						(diffError, diffStdout, diffStderr) => {
							if (diffError) {
								console.error("Error getting git diff:", diffStderr);
								reject(`Error fetching changes: ${diffStderr}`);
								return;
							}
							const serializedLineData = JSON.stringify(
								Array.from(parseDiff(diffStdout))
							);
							resolve(serializedLineData);
						}
					);
				}
			}
		);
	});
}

/**
 * Parse the diff output to get the changed lines in the file.
 */
function parseDiff(diffOutput: string): Set<number> {
	const changedLines = new Set<number>();
	const regex = /^\+\+\+ b\/.*\n@@ -\d+,\d+ \+(\d+),(\d+) @@/gm;
	let match;

	while ((match = regex.exec(diffOutput)) !== null) {
		const startLine = parseInt(match[1], 10);
		const lineCount = parseInt(match[2], 10);

		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			changedLines.add(startLine + lineIndex);
		}
	}

	return changedLines;
}

export function createGitRepository() {
	const terminal = vscode.window.createTerminal({
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

/** Notification Management utils */
const notificationTimes = new Map();
const TWENTY_MINUTES = 1200000; // 20min in milliseconds

function getLastNotifiedTime(uri: vscode.Uri): number {
	return notificationTimes.get(uri.toString()) || 0;
}

function updateLastNotifiedTime(uri: vscode.Uri, time: number) {
	notificationTimes.set(uri.toString(), time);
}

function getNotificationInterval(): number {
	return vscode.workspace
		.getConfiguration("whenInRome")
		.get("notificationInterval", TWENTY_MINUTES);
}

