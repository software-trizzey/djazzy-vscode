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

import { EXTENSION_ID, EXTENSION_NAME, COMMANDS, SESSION_USER, SESSION_TOKEN_KEY } from "./common/constants";

import {
	createGitRepository,
	getChangedLines,
	checkAndNotify,
} from "./common/utils/git";
import { registerCommands } from './common/commands';

async function initializeAuthentication(
	credentials: Credentials,
	context: vscode.ExtensionContext
): Promise<boolean> {
	console.log("Initializing authentication...");
	const storedUser: UserSession = context.globalState.get(SESSION_USER);
	const token = context.globalState.get(SESSION_TOKEN_KEY);
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
	const credentials = new Credentials();
	await credentials.initialize(context);

	const serverModule = context.asAbsolutePath(
		path.join("server", "out", "server.js")
	);

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
		watcher.onDidChange(() => checkAndNotify(uri, client));
		watcher.onDidCreate(() => checkAndNotify(uri, client));
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
				if (command === COMMANDS.CREATE_REPOSITORY) {
					createGitRepository();
					return;
				}
				return next(command, args);
			},
		},
	};

	client = new LanguageClient(
		EXTENSION_ID,
		EXTENSION_NAME,
		serverOptions,
		clientOptions
	);

	registerCommands(context, client, deactivate);

	const authenticated = await initializeAuthentication(credentials, context);
	if (authenticated) {
		client.start().then(() => {
			client.onRequest(COMMANDS.GET_GIT_DIFF, getChangedLines);
		});
	}
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
