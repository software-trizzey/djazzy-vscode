import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { UserSession } from "./auth/github";
import { authenticateUser,  removeApiKey } from "./auth/api";
import { COMMANDS, EXTENSION_ID, EXTENSION_NAME, IGNORED_DIAGNOSTICS_ID, PUBLISHER, SESSION_USER } from "./constants";
import { trackUserInterestInCustomRules } from "./logs";

const WORKBENCH_ACTIONS = {
	OPEN_WALKTHROUGH: 'workbench.action.openWalkthrough',
	OPEN_SETTINGS: 'workbench.action.openSettings'
};


export function registerCommands(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    activate: (context: vscode.ExtensionContext) => Promise<void>,
    deactivate: () => Thenable<void> | undefined
){
    let ignoredDiagnostics = new Set<string>();

    const persistedIgnoredDiagnostics = context.globalState.get<string[]>(IGNORED_DIAGNOSTICS_ID);
    if (persistedIgnoredDiagnostics) {
        ignoredDiagnostics = new Set(persistedIgnoredDiagnostics);
    }

    const signIn = vscode.commands.registerCommand(
        COMMANDS.SIGN_IN,
        () => authenticateUser(context, activate)
    );
    context.subscriptions.push(signIn);

    const signOutCommand = vscode.commands.registerCommand(
        COMMANDS.SIGN_OUT,
        () => removeApiKey(context, client, deactivate)
    );
    context.subscriptions.push(signOutCommand);

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

    const ignoreDiagnosticCommand = vscode.commands.registerCommand(COMMANDS.IGNORE_DIAGNOSTIC, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found.');
            return;
        }
    
        const document = editor.document;
        const position = editor.selection.active;
    
        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        const diagnosticToIgnore = diagnostics.find(diagnostic => diagnostic.range.contains(position));
    
        if (diagnosticToIgnore) {
            const diagnosticId = `${document.uri.toString()}:${diagnosticToIgnore.range.start.line}:${diagnosticToIgnore.range.start.character}`;
            ignoredDiagnostics.add(diagnosticId);
            vscode.window.showInformationMessage('Diagnostic ignored for this session.');
    
            // Optionally persist ignored diagnostics (e.g., in global state)
            context.globalState.update(IGNORED_DIAGNOSTICS_ID, Array.from(ignoredDiagnostics));
        } else {
            vscode.window.showInformationMessage('No diagnostic found at the current position.');
        }
    });
    
    context.subscriptions.push(ignoreDiagnosticCommand);


    const requrestDiagnosticsCommand = vscode.commands.registerCommand(COMMANDS.REQUEST_DIAGNOSTICS, async (documentUri: vscode.Uri) => {
        const document = await vscode.workspace.openTextDocument(documentUri);

        // Send the request to the server with the ignored diagnostics
        const diagnostics = await vscode.commands.executeCommand<vscode.Diagnostic[]>(
            'vscode.executeDiagnosticProvider',
            document.uri,
            Array.from(ignoredDiagnostics)
        );

        // Optionally, handle the diagnostics (e.g., display them in the UI)
        vscode.languages.createDiagnosticCollection().set(document.uri, diagnostics);
    });

    context.subscriptions.push(requrestDiagnosticsCommand);
}
