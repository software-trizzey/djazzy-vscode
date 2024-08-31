import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

import { ExceptionHandlingCodeActionProvider } from './codeActions/exceptionProvider';



export function registerActions(context: vscode.ExtensionContext, client: LanguageClient): void {
	context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('python', new ExceptionHandlingCodeActionProvider(client), {
            providedCodeActionKinds: ExceptionHandlingCodeActionProvider.providedCodeActionKinds
        })
    );
}