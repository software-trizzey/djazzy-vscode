import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

import { COMMANDS } from '../constants';


export class ExceptionHandlingCodeActionProvider implements vscode.CodeActionProvider {
    static providedCodeActionKinds = [
        vscode.CodeActionKind.RefactorRewrite
    ];

    constructor(private client: LanguageClient) {}

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): Thenable<vscode.CodeAction[]> | undefined {
        const lineText = document.lineAt(range.start.line).text;
        const functionNameMatch = lineText.match(/def\s+(\w+)\s*\(/);

        if (!functionNameMatch) {
            return undefined;
        }

        const functionName = functionNameMatch[1];
        const lineNumber = range.start.line;

        return this.client.sendRequest<vscode.CompletionItem[]>(
            COMMANDS.PROVIDE_EXCEPTION_HANDLING,
            { functionName, lineNumber, uri: document.uri.toString() }
        ).then(completionItems => {
            if (completionItems && completionItems.length > 0) {
				console.log("Received items:", completionItems);
                return completionItems.map(item => this.createRefactorAction(document, range, item, functionName));
            }
            return [];
        });
    }

	private createRefactorAction(
		document: vscode.TextDocument,
		range: vscode.Range,
		completionItem: vscode.CompletionItem,
		functionName: string
	): vscode.CodeAction {
        const action = new vscode.CodeAction(
			`Add exception handling: ${completionItem.label} for function: ${functionName}`,
			vscode.CodeActionKind.RefactorRewrite
		);
        action.edit = new vscode.WorkspaceEdit();
        const start = document.lineAt(range.start.line).range.start;
        const end = document.lineAt(range.end.line).range.end;
        action.edit.replace(document.uri, new vscode.Range(start, end), completionItem.insertText.toString() || '');
        action.isPreferred = true;
        return action;
    }
}