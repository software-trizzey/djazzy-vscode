import * as path from "path";
import * as vscode from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

import { Credentials } from "./common/auth/github";

import { EXTENSION_ID, EXTENSION_DISPLAY_NAME, COMMANDS } from "./common/constants";

import {
	getChangedLines,
} from "./common/utils/git";
import { registerCommands } from './common/commands';
import { setupFileWatchers } from './common/utils/fileWatchers';
import { authenticateUser } from './common/auth/api';


let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
	const credentials = new Credentials();
	await credentials.initialize(context);

    const isAuthenticated = await authenticateUser(context, activate);
	if (!isAuthenticated) return;

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

	registerCommands(context, client, activate, deactivate);

	client.start().then(async () => {
		client.onRequest(COMMANDS.GET_GIT_DIFF, getChangedLines);

		const token = context.globalState.get(COMMANDS.USER_API_KEY);
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