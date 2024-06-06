// commands.ts
import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { Credentials, UserSession } from "./auth/github";
import { signInWithGitHub, signOutUser } from "./auth/api";
import { COMMANDS, SESSION_USER } from "./constants";
import { renameSymbolWithSuggestions } from './utils/rename';
import { trackUserInterestInCustomRules } from "./logs";

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
            vscode.window.showInformationMessage('Thanks for your interest in custom rules. This feature is coming soon!');
            trackUserInterestInCustomRules(storedUser.id);
        }
    );
    context.subscriptions.push(addCustomRuleCommand);

    const openWalkthroughCommand = vscode.commands.registerCommand(
        'whenInRome.openWalkthrough',
        () => vscode.commands.executeCommand('workbench.action.openWalkthrough', 'whenInRome.gettingStarted', true)
    );
    context.subscriptions.push(openWalkthroughCommand);
}
