import * as path from "path";
import * as vscode from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

import { EXTENSION_ID, EXTENSION_DISPLAY_NAME, COMMANDS, RATE_LIMIT_NOTIFICATION_ID, ACCESS_FORBIDDEN_NOTIFICATION_ID } from "./common/constants";

import {
	getChangedLines,
} from "./common/utils/git";
import { registerCommands } from './common/commands';
import { registerActions } from './common/actions';
import { setupFileWatchers } from './common/utils/fileWatchers';
import { authenticateUserWithGitHub } from './common/auth/api';
import { initializeTelemetry } from '../../shared/telemetry';
import { SESSION_TOKEN_KEY, SESSION_USER, TELEMETRY_EVENTS, TELEMETRY_NOTIFICATION } from '../../shared/constants';
import { UserSession } from './common/auth/github';
import { AUTH_MESSAGES } from './common/constants/messages';


let client: LanguageClient;
let extensionContext: vscode.ExtensionContext;

export async function activate(context: vscode.ExtensionContext) {
	extensionContext = context;

	const reporter = initializeTelemetry();
	context.subscriptions.push(reporter);

	reporter.sendTelemetryEvent(TELEMETRY_EVENTS.EXTENSION_ACTIVATED);

	const session: UserSession | undefined = context.globalState.get(SESSION_USER);
	const legacyApiKey: string | undefined = context.globalState.get(COMMANDS.USER_API_KEY);
	
	if (legacyApiKey && !session) {
		const migrateAction = "Sign in with GitHub";
		const response = await vscode.window.showInformationMessage(
			AUTH_MESSAGES.LEGACY_API_KEY_MIGRATION,
			migrateAction
		);

		if (response === migrateAction) {
			const isAuthenticated = await authenticateUserWithGitHub(context);
			if (!isAuthenticated) {
				reporter.sendTelemetryErrorEvent(TELEMETRY_EVENTS.AUTHENTICATION_FAILED, {
					reason: 'Legacy user migration failed',
					had_api_key: 'true',
					user_api_key: legacyApiKey,
				});
				vscode.window.showErrorMessage(AUTH_MESSAGES.AUTHENTICATION_REQUIRED);
				return;
			}
			// Clear legacy API key after successful migration
			await context.globalState.update(COMMANDS.USER_API_KEY, undefined);
			reporter.sendTelemetryEvent(TELEMETRY_EVENTS.LEGACY_USER_MIGRATED);
		} else {
			vscode.window.showWarningMessage(AUTH_MESSAGES.LEGACY_API_KEY_REQUIRED_MIGRATION);
			return;
		}
	} else if (!session || !session.user.has_agreed_to_terms) {
		const isAuthenticated = await authenticateUserWithGitHub(context);
		if (!isAuthenticated) {
			vscode.window.showWarningMessage(AUTH_MESSAGES.AUTHENTICATION_REQUIRED);
			reporter.sendTelemetryErrorEvent(TELEMETRY_EVENTS.AUTHENTICATION_FAILED, {
				reason: 'User did not authenticate',
				user_id: session?.user.id || 'unknown',
			});
			console.log('Failed to authenticate user. Exiting extension.');
			return;

		}
		
		const updatedSession = context.globalState.get<UserSession>(SESSION_USER);
		if (!updatedSession?.user.has_agreed_to_terms) {
			vscode.window.showErrorMessage(AUTH_MESSAGES.MUST_AGREE_TO_TERMS);
			reporter.sendTelemetryErrorEvent(TELEMETRY_EVENTS.TERMS_NOT_ACCEPTED, {
				reason: 'User did not agree to terms',
				user_id: updatedSession?.user.id || 'unknown',
			});
			console.log('User has not agreed to terms. Exiting extension.');
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

	registerCommands(context, client, activate, deactivate);
	registerActions(context, client);

	client.onRequest(COMMANDS.GET_GIT_DIFF, getChangedLines);

	const token = context.globalState.get(SESSION_TOKEN_KEY);
	if (token) {
		await client.sendRequest(COMMANDS.UPDATE_CACHED_USER_TOKEN, token);
	}

	const apiFolderWatchers = await setupFileWatchers(client, context);
	clientOptions.synchronize = {
		...clientOptions.synchronize,
		fileEvents: apiFolderWatchers
	};

	client.onNotification(TELEMETRY_NOTIFICATION.EVENT, (params: { 
		eventName: string, 
		properties?: { [key: string]: string },
		timestamp: string 

	}) => {
		reporter.sendTelemetryEvent(
			`server.${params.eventName}`, 
			{
				...params.properties,
				timestamp: params.timestamp
			}
		);
	});
}

export async function deactivate(context: vscode.ExtensionContext): Promise<void> {
	if (!client) return undefined;
	
	await client.stop();
}


export function activateClientNotifications(client: LanguageClient) {
    client.onNotification(RATE_LIMIT_NOTIFICATION_ID, (params: { message: string }) => {
        vscode.window.showWarningMessage(params.message, "Okay");
    });

    client.onNotification(ACCESS_FORBIDDEN_NOTIFICATION_ID, (params: { message: string }) => {
        vscode.window.showErrorMessage(params.message);
    });
}