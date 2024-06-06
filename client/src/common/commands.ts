import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { Credentials, UserSession } from "./auth/github";
import { signInWithGitHub, signOutUser } from "./auth/api";
import { COMMANDS, EXTENSION_ID, EXTENSION_NAME, PUBLISHER, SESSION_USER } from "./constants";
import { renameSymbolWithSuggestions } from './utils/rename';
import { trackUserInterestInCustomRules } from "./logs";

const WORKBENCH_ACTIONS = {
	OPEN_WALKTHROUGH: 'workbench.action.openWalkthrough',
	OPEN_SETTINGS: 'workbench.action.openSettings'
};

export function registerCommands(context: vscode.ExtensionContext, client: LanguageClient, deactivate: () => void){
    const credentials = new Credentials();

    const signInWithGitHubCommand = vscode.commands.registerCommand(
        COMMANDS.SIGN_IN,
        () => signInWithGitHub(credentials, context, deactivate)
    );
    context.subscriptions.push(signInWithGitHubCommand);

    const signOutCommand = vscode.commands.registerCommand(
        COMMANDS.SIGN_OUT,
        () => signOutUser(context)
    );
    context.subscriptions.push(signOutCommand);

    const renameSymbolCommand = vscode.commands.registerCommand(
        COMMANDS.RENAME_SYMBOL,
        () => renameSymbolWithSuggestions(client)
    );
    context.subscriptions.push(renameSymbolCommand);

    const addCustomRuleCommand = vscode.commands.registerCommand(
        COMMANDS.ADD_CUSTOM_RULE,
        () => {
			const storedUser: UserSession = context.globalState.get(SESSION_USER);
            vscode.window.showInformationMessage('Thanks for your interest in automated rules setup. This feature is coming soon! 🚀');
            trackUserInterestInCustomRules(storedUser.id);
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
