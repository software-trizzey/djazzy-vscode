import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

import { UserSession } from "./auth/github";
import { COMMANDS, EXTENSION_ID, EXTENSION_NAME, PUBLISHER, SESSION_USER } from "./constants";

import { ExceptionHandlingCommandProvider } from './providers/exceptionProvider';
import { trackExceptionHandlingResultFeedback, trackFeatureUsage, trackUserInterestInCustomRules } from "./logs";
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

    context.subscriptions.push(vscode.commands.registerCommand(
        COMMANDS.SIGN_OUT,
        () => removeApiKey(context, client, () => deactivate(context))
    ));

    const addCustomRuleCommand = vscode.commands.registerCommand(
        COMMANDS.ADD_CUSTOM_RULE,
        () => {
			const storedUser: UserSession = context.globalState.get(SESSION_USER);
            if (storedUser) {
                trackUserInterestInCustomRules(storedUser.email || storedUser.github_login);
            } else {
                const serverHost = vscode.env.machineId;
                trackUserInterestInCustomRules(serverHost);
            }
            vscode.window.showInformationMessage('Thanks for your interest in automated rules setup. This feature is coming soon! 🚀', "Sounds good");
        }
    );
    context.subscriptions.push(addCustomRuleCommand);

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

            trackFeatureUsage(token as string, 'analyzeExceptionHandling');

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

    context.subscriptions.push(vscode.commands.registerCommand(
        COMMANDS.NPLUSONE_FEEDBACK,
        async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
            const feedback = await vscode.window.showQuickPick(['Good', 'Bad', 'False Positive'], {
                placeHolder: 'How would you rate this N+1 suggestion?'
            });

            if (feedback) {
                vscode.window.showInformationMessage('Thank you for your response!');
                const token = context.globalState.get(COMMANDS.USER_API_KEY) || "Anonymous";
                trackExceptionHandlingResultFeedback(token as string, feedback);
            }
        }
    ));
}
