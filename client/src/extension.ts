import * as path from "path";
import * as vscode from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

import { Credentials } from "./common/auth/github";
import { signInWithGitHub } from "./common/auth/api";
import type { UserSession } from "./common/auth/github";

import { EXTENSION_ID, EXTENSION_DISPLAY_NAME, COMMANDS, SESSION_USER, SESSION_TOKEN_KEY } from "./common/constants";

import {
	getChangedLines,
} from "./common/utils/git";
import { registerCommands } from './common/commands';
import { setupFileWatchers } from './common/utils/fileWatchers';
import { telemetryReporter } from './common/telemetry';

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
		const newUser: UserSession = context.globalState.get(SESSION_USER);
		const newToken = context.globalState.get(SESSION_TOKEN_KEY);
		return !!(newToken && newUser);
	}
}

let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(telemetryReporter);


	const credentials = new Credentials();
	await credentials.initialize(context);

	const authenticated = await initializeAuthentication(credentials, context);
	if (!authenticated) {
		vscode.window.showErrorMessage(
			"You need to sign in with GitHub to use this extension. Please sign in and reload the window.",
			"Sign In"
		).then(async (selection) => {
			if (selection === "Sign In") {
				await signInWithGitHub(credentials, context, deactivate);
				vscode.commands.executeCommand('workbench.action.reloadWindow');
			}
		});
		return;
	}

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

	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: "file", language: "python" },
		],
		synchronize: {
			fileEvents: []
		},
	};

	client = new LanguageClient(
		EXTENSION_ID,
		EXTENSION_DISPLAY_NAME,
		serverOptions,
		clientOptions
	);

	registerCommands(context, client, deactivate);

	client.start().then(async () => {
		client.onRequest(COMMANDS.GET_GIT_DIFF, getChangedLines);

		const token = context.globalState.get(SESSION_TOKEN_KEY);
		if (token) {
			await client.sendRequest(COMMANDS.UPDATE_CACHED_USER_TOKEN, token);
		}

		const apiFolderWatchers = await setupFileWatchers(client, context);
		clientOptions.synchronize.fileEvents = apiFolderWatchers;
	});
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
