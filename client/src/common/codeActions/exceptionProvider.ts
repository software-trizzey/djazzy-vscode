import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { COMMANDS } from '../constants';

interface FunctionBodyNode {
	absolute_line_number: number;
	content: string;
	end_col: number;
	relative_line_number: number;
	start_col: number;
}

interface FunctionCallSite {
	line: number;
	col: number;
}

export interface FunctionDetails {
    name: string;
    args: string[];
    returns: string | null;
    body: FunctionBodyNode[];
	raw_body: string;
    decorators: string[];
	context: {
		start: number;
		end: number;
		start_col: number;
		end_col: number;
		imports: string[];
		call_sites: FunctionCallSite[];
	}
}

export class ExceptionHandlingCodeActionProvider implements vscode.CodeActionProvider {
    static providedCodeActionKinds = [
        vscode.CodeActionKind.RefactorRewrite
    ];

    private lastRequest: Promise<vscode.CodeAction[]> | undefined;
    private lastTokenSource: vscode.CancellationTokenSource | undefined;

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

        if (this.lastTokenSource) {
            console.log('Cancelling previous exception action request');
            this.lastTokenSource.cancel();
        }

        this.lastTokenSource = new vscode.CancellationTokenSource();

        this.lastRequest = Promise.resolve(
			this.client.sendRequest<{ completionItems: vscode.CompletionItem[], functionNode: FunctionDetails }>(
				COMMANDS.PROVIDE_EXCEPTION_HANDLING,
				{ functionName, lineNumber, uri: document.uri.toString() },
				this.lastTokenSource.token
			).then(response => {
				const { completionItems, functionNode } = response;
				if (completionItems && completionItems.length > 0 && functionNode) {
					console.log("Received items:", completionItems);
                    this.notifyUserWithSuggestions(document, functionNode, completionItems);

					return completionItems.map(item => this.createRefactorAction(document, functionNode, item, functionName));
				}
				return [];
			})
		);

        this.lastRequest.catch((err) => {
            if (err && err.code === 'REQUEST_CANCELLED') {
                console.log('Request was cancelled.');
            } else {
                console.error('Request failed:', err);
            }
        });

        return this.lastRequest;
    }

    private createRefactorAction(
        document: vscode.TextDocument,
        functionNode: FunctionDetails,
        completionItem: vscode.CompletionItem,
        functionName: string
    ): vscode.CodeAction {
        const title = completionItem.label.toString();
        const action = new vscode.CodeAction(
            title || `Add exception handling for function: ${functionName}`,
            vscode.CodeActionKind.RefactorRewrite
        );

        const start = new vscode.Position(functionNode.context.start - 1, functionNode.context.start_col);
        const end = new vscode.Position(functionNode.context.end - 1, functionNode.context.end_col);

        action.command = {
            title: 'Preview and Apply',
            command: COMMANDS.PREVIEW_AND_APPLY_SUGGESTION,
            arguments: [document, functionNode, completionItem, new vscode.Range(start, end)]
        };

        action.isPreferred = true;
        return action;
    }

    private async notifyUserWithSuggestions(
        originalDocument: vscode.TextDocument,
        functionNode: FunctionDetails,
        completionItems: vscode.CompletionItem[] = []
    ): Promise<void> {
        const quickPickItems = completionItems.map(item => ({
            label: item.label.toString(),
            description: item.detail || '',
            item
        }));

        const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select an exception handling suggestion to view',
            canPickMany: false
        });

        if (selectedItem) {
            await this.showSuggestionInNewEditor(originalDocument, functionNode, selectedItem.item);
        }
    }

	private async showSuggestionInNewEditor(
		originalDocument: vscode.TextDocument,
		functionNode: FunctionDetails,
		completionItem: vscode.CompletionItem
	): Promise<void> {
		const previewDocument = await vscode.workspace.openTextDocument({
			content: completionItem.insertText?.toString() || '',
			language: 'python'
		});
	
		const previewEditor = await vscode.window.showTextDocument(previewDocument, {
			preview: true,
			viewColumn: vscode.ViewColumn.Beside // Open beside the current editor
		});
	
		const applyAction = 'Apply';
		const userChoice = await vscode.window.showInformationMessage(
			`Apply the selected exception handling suggestion to the original document?`,
			applyAction,
			'Cancel'
		);
	
		if (userChoice === applyAction) {
			this.applySuggestionToOriginalDocument(originalDocument, functionNode, completionItem);
		}
	
		await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	}	

    private applySuggestionToOriginalDocument(
        originalDocument: vscode.TextDocument,
        functionNode: FunctionDetails,
        completionItem: vscode.CompletionItem
    ): void {
        const editor = vscode.window.visibleTextEditors.find(editor => editor.document === originalDocument);
        if (!editor) {
            return;
        }

        const start = new vscode.Position(functionNode.context.start - 1, functionNode.context.start_col);
        const end = new vscode.Position(functionNode.context.end - 1, functionNode.context.end_col);

        editor.edit(editBuilder => {
            editBuilder.replace(new vscode.Range(start, end), completionItem.insertText?.toString() || '');
        }).then(success => {
            if (success) {
                vscode.window.showInformationMessage(`Applied suggestion: ${completionItem.label}`);
            } else {
                vscode.window.showErrorMessage('Failed to apply the suggestion');
            }
        });
    }
}
