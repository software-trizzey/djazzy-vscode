import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

import { UserSession } from "./auth/github";
import { COMMANDS, EXTENSION_ID, EXTENSION_NAME, PUBLISHER, SESSION_USER } from "./constants";
import { trackUserInterestInCustomRules } from "./logs";

const WORKBENCH_ACTIONS = {
	OPEN_WALKTHROUGH: 'workbench.action.openWalkthrough',
	OPEN_SETTINGS: 'workbench.action.openSettings'
};

export function registerCommands(
    context: vscode.ExtensionContext,
    client: LanguageClient
): void {
    const suggestionExceptionCommand = vscode.commands.registerCommand(COMMANDS.SUGGEST_EXCEPTIONS, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
    
        const document = editor.document;
        const position = editor.selection.active;
    
        const lineText = document.lineAt(position.line).text;
        const functionNameMatch = lineText.match(/def\s+(\w+)\s*\(/);
    
        if (!functionNameMatch) {
            vscode.window.showWarningMessage('No function detected at the current position.');
            return;
        }
    
        const functionName = functionNameMatch[1];
        const lineNumber = position.line;
        console.log('Function name:', functionName, 'Line number:', lineNumber);
    
       const completionItems = await client.sendRequest<vscode.CompletionItem[]>(
            COMMANDS.PROVIDE_EXCEPTION_HANDLING,
            { functionName, lineNumber, uri: document.uri.toString() }
        );

        if (completionItems) {
            console.log("Received completion items:", completionItems);
            vscode.window.showInformationMessage('Exception suggestions are available. 🚀', {
                title: 'View suggestions',
                action: () => {
                    vscode.commands.executeCommand('editor.action.triggerSuggest');
                }
            });
        } else {
            vscode.window.showWarningMessage('No exception suggestions available.');
        }
    });    
    context.subscriptions.push(suggestionExceptionCommand);

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
}
