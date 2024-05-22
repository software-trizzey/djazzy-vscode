import * as path from "path";
import * as vscode from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

import { Credentials } from "./common/auth/github";
import { signInWithGitHub, signOutUser } from "./common/auth/api";
import type { UserSession } from "./common/auth/github";

import {
	createGitRepository,
	getChangedLines,
	checkAndNotify,
} from "./common/utils/git";

async function initializeAuthentication(
	credentials: Credentials,
	context: vscode.ExtensionContext
): Promise<boolean> {
	console.log("Initializing authentication...");
	const storedUser: UserSession = context.globalState.get("whenInRomeUser");
	const token = context.globalState.get("whenInRomeUserToken");
	if (token && storedUser) {
		const { github_login, email } = storedUser;
		console.log("User is already signed in.", github_login || email);
		return true;
	} else {
		await signInWithGitHub(credentials, context, deactivate);
		return true;
	}
}

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
	const signInWithGitHubCommand = vscode.commands.registerCommand(
		"whenInRome.signIn",
		() => signInWithGitHub(credentials, context, deactivate)
	);
	context.subscriptions.push(signInWithGitHubCommand);
	const signOutCommand = vscode.commands.registerCommand(
		"whenInRome.signOut",
		() => signOutUser(context)
	);
	context.subscriptions.push(signOutCommand);

	const credentials = new Credentials();
	await credentials.initialize(context);

	const serverModule = context.asAbsolutePath(
		path.join("server", "out", "server.js")
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: {
			module: serverModule,
			transport: TransportKind.ipc,
		},
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		},
	};

	const apiFolders = await vscode.workspace.findFiles(
		"**/{api,views}/*",
		"{**/node_modules/**,**/*test*/*,**/* (Working Tree)*}"
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

	const authenticated = await initializeAuthentication(credentials, context);
	if (authenticated) {
		client.start().then(() => {
			client.onRequest("whenInRome.getGitDiff", getChangedLines);
		});
	}
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
