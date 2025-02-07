import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

import { COMMANDS, EXTENSION_ID, EXTENSION_NAME, PUBLISHER } from "./constants";
import { COMMANDS as GlobalCommands } from '../../../shared/constants';

import { GitHubAuthProvider } from './auth/github';
import { ExceptionHandlingCommandProvider } from './providers/exceptionProvider';
import { authenticateUser, removeApiKey } from './auth/api';

const WORKBENCH_ACTIONS = {
	OPEN_WALKTHROUGH: 'workbench.action.openWalkthrough',
	OPEN_SETTINGS: 'workbench.action.openSettings'
};

export async function registerCommands(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    activate: (context: vscode.ExtensionContext) => Promise<void>,
    deactivate: (context: vscode.ExtensionContext) => Thenable<void> | undefined
): Promise<void> {

    context.subscriptions.push(vscode.commands.registerCommand(
        COMMANDS.SIGN_IN,
        () => authenticateUser(context, activate)
    ));

    const authProvider = new GitHubAuthProvider(context);
    
    context.subscriptions.push(
        vscode.commands.registerCommand(
            GlobalCommands.GITHUB_SIGN_IN,
            async () => {
                console.log("GitHub sign in command triggered");
                try {
                    const userSession = await authProvider.signIn();
                    console.log('Cached user session', userSession);
                    vscode.window.showInformationMessage('Successfully signed into Djangoly!');
                } catch (error) {
                    console.error("Sign in error:", error);
                    vscode.window.showErrorMessage('Failed to sign in to Djangoly');
                }
            }
        )
    );

    context.subscriptions.push(vscode.commands.registerCommand(
        COMMANDS.SIGN_OUT,
        () => removeApiKey(context, client, () => deactivate(context))
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
