import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { COMMANDS } from '../constants';
import { ERROR_CODES, ERROR_MESSAGES } from '../constants/errors';

import { reporter } from '../../../../shared/telemetry';
import { SESSION_USER, TELEMETRY_EVENTS } from '../../../../shared/constants';
import { UserSession } from '../auth/github';


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


export class ExceptionHandlingCommandProvider {
    private lastTokenSource: vscode.CancellationTokenSource | undefined;

    constructor(private client: LanguageClient, private context: vscode.ExtensionContext) {}

    public async provideExceptionHandling(
        document: vscode.TextDocument,
        functionName: string,
        lineNumber: number
    ): Promise<void> {
        if (this.lastTokenSource) {
            console.log('Cancelling previous exception action request');
            this.lastTokenSource.cancel();
        }
    
        this.lastTokenSource = new vscode.CancellationTokenSource();
    
        try {
            let response: { completionItems: Array<vscode.CompletionItem>, functionNode: FunctionDetails } | null = null;
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Djangoly",
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    console.log('User cancelled the exception handling request');
                    this.lastTokenSource?.cancel();
                });
    
                progress.report({ message: "Analyzing function..." });
    
                response = await this.client.sendRequest<
                    { completionItems: Array<vscode.CompletionItem>, functionNode: FunctionDetails }
                >(
                    COMMANDS.PROVIDE_EXCEPTION_HANDLING,
                    { functionName, lineNumber, uri: document.uri.toString() },
                    this.lastTokenSource?.token
                ).catch((error) => {
                    const errorCode = error?.data?.code;
                    if (errorCode === ERROR_CODES.UNAUTHENTICATED) {
                        vscode.window.showErrorMessage(ERROR_MESSAGES.FEATURE_GATED);
                    } else {
                        vscode.window.showErrorMessage(error.message || 'An unexpected error occurred.');
                    }
                    return null;
                });
                
                if (!response) return;

                progress.report({ message: "Suggestions received. Preparing to display..." });
                
            });

            if (response) {
                const { completionItems, functionNode } = response as { completionItems: Array<vscode.CompletionItem>, functionNode: FunctionDetails };
                if (completionItems && completionItems.length > 0 && functionNode) {
                    await this.notifyUserWithSuggestions(document, functionNode, completionItems);
                }
            }
        } catch (err: any) {
            if (err && err.code === 'REQUEST_CANCELLED') {
                console.log('Request was cancelled.');
            } else {
                console.error('Request failed:', err);
            }
        }
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
        const previewContent = `\n\n# Read-Only Preview: You can review this suggestion but changes won't be saved\n\n${completionItem.insertText?.toString() || ''}`;

        const previewDocument = await vscode.workspace.openTextDocument({
            content: previewContent,
            language: 'python'
        });

        const previewEditor = await vscode.window.showTextDocument(previewDocument, {
            preview: true,
            viewColumn: vscode.ViewColumn.Beside
        });

        const readOnlyDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new vscode.ThemeColor('editorWarning.background'),
            overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            before: {
                contentText: 'Read-Only Preview',
                margin: '0 1rem 0 0',
                color: new vscode.ThemeColor('editorWarning.foreground'),
            }
        });
        
        previewEditor.setDecorations(readOnlyDecorationType, [
            { range: new vscode.Range(0, 0, previewDocument.lineCount, 0) }
        ]);

        const applyAction = 'Apply';
        const userChoice = await vscode.window.showInformationMessage(
            `Apply the selected exception handling suggestion to the original document?`,
            applyAction,
            'Cancel'
        );

        if (userChoice === applyAction) {
            this.applySuggestionToOriginalDocument(originalDocument, functionNode, completionItem);
        }

        const previewEditorGroup = vscode.window.tabGroups.activeTabGroup;
        const previewEditorTab = previewEditorGroup.tabs.find(tab => tab.isActive);

        if (previewEditorTab) {
            if (previewEditorTab.isDirty) {
                await this.clearEditorContent(previewEditor);
            }
            await vscode.window.tabGroups.close(previewEditorTab, false);
        }
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
                const feedbackPrompt = 'How would you rate this suggestion?';
                const feedbackActions = {
                    positive: 'Good',
                    negative: 'Bad',
                    neutral: 'Not sure'
                };

                vscode.window.showInformationMessage(
                    `Applied suggestion: ${completionItem.label}.\n\n${feedbackPrompt}`,
                    feedbackActions.positive, feedbackActions.neutral, feedbackActions.negative
                ).then(feedback => {
                    if (feedback) {
                        const session = this.context.globalState.get<UserSession>(SESSION_USER);
                        if (!session) {
                            console.log('User is not signed in. Skipping feedback tracking.');
                            return;
                        }
                        reporter.sendTelemetryEvent(TELEMETRY_EVENTS.EXCEPTION_HANDLING_RESULT_FEEDBACK, {
                            user: session.user.id,
                            feedback: feedback
                        });
                    }
                });
            } else {
                vscode.window.showErrorMessage('Failed to apply the suggestion');
            }
        });
    }

    private async clearEditorContent(editor: vscode.TextEditor): Promise<void> {
        await editor.edit(editBuilder => {
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(editor.document.getText().length)
            );
            editBuilder.delete(fullRange);
        });
    }
}
