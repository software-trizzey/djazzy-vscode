import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

import { COMMANDS, EXTENSION_ID, EXTENSION_NAME, PUBLISHER, SESSION_USER } from "./constants";
import { COMMANDS as GlobalCommands, TELEMETRY_EVENTS } from '../../../shared/constants';

import { UserSession } from './auth/github';
import { ExceptionHandlingCommandProvider } from './providers/exceptionProvider';
import { authenticateUserWithGitHub, signOutUser } from './auth/api';
import { AUTH_MESSAGES } from './constants/messages';
import { reporter } from '../../../shared/telemetry';

const WORKBENCH_ACTIONS = {
	OPEN_WALKTHROUGH: 'workbench.action.openWalkthrough',
	OPEN_SETTINGS: 'workbench.action.openSettings'
};

export async function registerCommands(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    activate: (context: vscode.ExtensionContext) => Promise<void>,
    deactivate: (context: vscode.ExtensionContext) => Thenable<void> | undefined,
): Promise<void> {

    context.subscriptions.push(vscode.commands.registerCommand(
        COMMANDS.SIGN_IN,
        async () => {
            try {
                // TODO: Check for valid api key if legacy user
                reporter.sendTelemetryEvent(TELEMETRY_EVENTS.SIGN_IN_STARTED);
                const authenticated = await authenticateUserWithGitHub(context);
                if (!authenticated) {
                    throw new Error('User did not authenticate');
                }
                const session = context.globalState.get<UserSession>(SESSION_USER);
                reporter.sendTelemetryEvent(TELEMETRY_EVENTS.SIGN_IN, {
                    user: session?.user.id || 'unknown',
                });
                await activate(context);
            } catch (error) {
                console.error("Sign in error:", error);
                vscode.window.showErrorMessage(AUTH_MESSAGES.SIGN_IN_FAILURE);
            }
        }
    ));

    
    context.subscriptions.push(
        vscode.commands.registerCommand(
            GlobalCommands.GITHUB_SIGN_IN,
            async () => {
                try {
                    reporter.sendTelemetryEvent(TELEMETRY_EVENTS.SIGN_IN_STARTED);
                    const authenticated = await authenticateUserWithGitHub(context);
                    if (!authenticated) {
                        throw new Error('User did not authenticate');
                    }
                    const session = context.globalState.get<UserSession>(SESSION_USER);
                    reporter.sendTelemetryEvent(TELEMETRY_EVENTS.SIGN_IN, {
                        user: session?.user.id || 'unknown',
                    });
                    await activate(context);
                } catch (error) {
                    console.error("Sign in error:", error);
                    vscode.window.showErrorMessage(AUTH_MESSAGES.SIGN_IN_FAILURE);
                }
            }
        )
    );

    context.subscriptions.push(vscode.commands.registerCommand(
        COMMANDS.SIGN_OUT,
        async () => {
            const session = context.globalState.get<UserSession>(SESSION_USER);
            await signOutUser(context);
            reporter.sendTelemetryEvent(TELEMETRY_EVENTS.SIGN_OUT, {
                user: session?.user.id || 'unknown',
            });
            await deactivate(context);
        }
    ));

    const openWalkthroughCommand = vscode.commands.registerCommand(
        COMMANDS.OPEN_WALKTHROUGH,
        () => vscode.commands.executeCommand(WORKBENCH_ACTIONS.OPEN_WALKTHROUGH, `${EXTENSION_ID}.gettingStarted`, true)
    );
    context.subscriptions.push(openWalkthroughCommand);

	const openSettingsCommand = vscode.commands.registerCommand(
        COMMANDS.OPEN_SETTINGS,
        () => vscode.commands.executeCommand(WORKBENCH_ACTIONS.OPEN_SETTINGS, `@ext:${PUBLISHER}.${EXTENSION_NAME}`)
    );
    context.subscriptions.push(openSettingsCommand);

    
    context.subscriptions.push(vscode.commands.registerCommand(
        COMMANDS.ANALYZE_EXCEPTION_HANDLING, async (uri: vscode.Uri, range: vscode.Range | undefined) => {
            const token = context.globalState.get(COMMANDS.USER_API_KEY);
            if (!token) {
                vscode.window.showErrorMessage('Please sign in to use this feature.');
                return;
            }

            const editor = vscode.window.activeTextEditor;

            if (!editor || editor.document.uri.toString() !== uri.toString()) {
                vscode.window.showErrorMessage('Could not find the active editor for the selected file.');
                return;
            }
    
            if (!range) {
                range = editor.selection;
            }

            const commandProvider = new ExceptionHandlingCommandProvider(client, context);
            const document = await vscode.workspace.openTextDocument(uri);
            const lineText = document.lineAt(range.start.line).text;
            const functionNameMatch = lineText.match(/def\s+(\w+)\s*\(/);

            if (!functionNameMatch) {
                vscode.window.showErrorMessage('No function detected at the selected line.', 'Got it');
                return;
            }

            const functionName = functionNameMatch[1];
            const lineNumber = range.start.line;
            await commandProvider.provideExceptionHandling(document, functionName, lineNumber);
        })
    );
}
