import * as path from "path";
import * as vscode from "vscode";

import {
	LanguageClient,
	LanguageClientOptions,
	RevealOutputChannelOn,
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
import { initializeTelemetry } from '../../shared/telemetry';
import { TELEMETRY_EVENTS, TELEMETRY_NOTIFICATION } from '../../shared/constants';
import { AuthService } from './common/auth/authService';
import { logger } from './common/log';
import { isDevMode } from '../../shared/helpers';



let client: LanguageClient;
let extensionContext: vscode.ExtensionContext;

export async function activate(context: vscode.ExtensionContext) {
	extensionContext = context;

	const reporter = initializeTelemetry();
	context.subscriptions.push(reporter);

	reporter.sendTelemetryEvent(TELEMETRY_EVENTS.EXTENSION_ACTIVATED);

	const authService = new AuthService(context);
	if (!await authService.validateAuth()) {
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

	const isDev = isDevMode();
	logger.debug(`Djangoly in dev mode: ${isDev}`);
	const clientLogLevel = isDev ? RevealOutputChannelOn.Debug : RevealOutputChannelOn.Error;
	const clientOptions: LanguageClientOptions = {
		outputChannel: logger.getOutputChannel(),
		revealOutputChannelOn: clientLogLevel,
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
	logger.info("Client started");
	
	activateClientNotifications(client);

	registerCommands(context, client, activate, deactivate, authService);
	registerActions(context, client);

	client.onRequest(COMMANDS.GET_GIT_DIFF, getChangedLines);

	const session = authService.getSession();
	if (session) {
		logger.info(`Caching user token on language server: ${session.token}`);
		await client.sendRequest(COMMANDS.UPDATE_CACHED_USER_TOKEN, session.token);
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