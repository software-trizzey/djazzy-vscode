import * as path from "path";
import * as vscode from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

import { EXTENSION_ID, EXTENSION_DISPLAY_NAME, COMMANDS, RATE_LIMIT_NOTIFICATION_ID, ACCESS_FORBIDDEN_NOTIFICATION_ID, API_KEY_SIGNUP_URL } from "./common/constants";
import { AUTH_MESSAGES } from './common/constants/messages';

import {
	getChangedLines,
} from "./common/utils/git";
import { registerCommands } from './common/commands';
import { registerActions } from './common/actions';
import { setupFileWatchers } from './common/utils/fileWatchers';
import { trackActivation, trackDeactivation } from './common/logs';
import { authenticateUser } from './common/auth/api';


let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {
    const signIn = "Sign In";
    const requestAPIKey = "Request API Key";
    let isAuthenticated = false;

    while (!isAuthenticated) {
        const action = await vscode.window.showInformationMessage(
            AUTH_MESSAGES.FREE_API_KEY_PROMPT,
            signIn,
            requestAPIKey
        );

        if (action === requestAPIKey) {
            vscode.env.openExternal(vscode.Uri.parse(API_KEY_SIGNUP_URL));
            await activate(context);
            return;
        } else if (action === signIn) {
            isAuthenticated = await authenticateUser(context, activate);
            if (!isAuthenticated) {
                vscode.window.showWarningMessage(AUTH_MESSAGES.AUTHENTICATION_REQUIRED);
            }
        } else {
			vscode.window.showInformationMessage(AUTH_MESSAGES.SIGN_OUT);
			deactivate(context);
			return;
		}
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

	await client.start();
	
	activateClientNotifications(client);
	trackActivation(context);

	
	registerCommands(context, client, activate, deactivate);
	registerActions(context, client);

	client.onRequest(COMMANDS.GET_GIT_DIFF, getChangedLines);

	const token = context.globalState.get(COMMANDS.USER_API_KEY);
	if (token) {
		await client.sendRequest(COMMANDS.UPDATE_CACHED_USER_TOKEN, token);
	}

	const apiFolderWatchers = await setupFileWatchers(client, context);
	clientOptions.synchronize.fileEvents = apiFolderWatchers;
}

export function deactivate(context: vscode.ExtensionContext): Thenable<void> | undefined {
	vscode.window.showInformationMessage(
		"Thank you for using Djangoly! If you have any feedback or suggestions, please let us know. See you later! 👋",
		"Bye"
	);

	if (!client) {
		return undefined;
	}
	return client.stop().then(() => {
		trackDeactivation(context);
	});
}


export function activateClientNotifications(client: LanguageClient) {
    client.onNotification(RATE_LIMIT_NOTIFICATION_ID, (params: { message: string }) => {
        vscode.window.showWarningMessage(params.message, "Okay");
    });

    client.onNotification(ACCESS_FORBIDDEN_NOTIFICATION_ID, (params: { message: string }) => {
        vscode.window.showErrorMessage(params.message);
    });
}