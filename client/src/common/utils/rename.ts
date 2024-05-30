import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';

import { COMMANDS } from '../constants';


async function provideRenameSuggestions(client: LanguageClient, params: any) {
	return client.sendRequest(COMMANDS.PROVIDE_RENAME_SUGGESTIONS, params);
}


export async function renameSymbolWithSuggestions(client: LanguageClient) {
	const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    const position = editor.selection.active;
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      vscode.window.showInformationMessage('No symbol selected');
      return;
    }

    const params = {
      textDocument: { uri: document.uri.toString() },
      position: position,
    };

    const suggestions = await provideRenameSuggestions(client, params) as any[];
	if (!suggestions || suggestions.length === 0) {
		vscode.window.showInformationMessage('No rename suggestions available');
		return;
	}

    const selected = await vscode.window.showQuickPick(suggestions, {
      placeHolder: 'Select a new name'
    });

    if (!selected) {
		console.log("User closed the quick pick without selecting a suggestion.");
		return;
    }

	const symbolReferences: vscode.Location[] = await vscode.commands.executeCommand(
		'vscode.executeReferenceProvider',
		document.uri,
		position
	);

	const renameParams = {
		textDocument: { uri: document.uri.toString() },
		position: position,
		newName: selected.label,
		references: symbolReferences.map(ref => ({
			uri: ref.uri.toString(),
			range: {
			start: { line: ref.range.start.line, character: ref.range.start.character },
			end: { line: ref.range.end.line, character: ref.range.end.character }
			}
		}))
	};
    const response = await client.sendRequest(COMMANDS.APPLY_RENAME_SYMBOL, renameParams) as any;
    if (response) {
		const workspaceEdit = new vscode.WorkspaceEdit();
		for (const change of response.documentChanges) {
			const uri = vscode.Uri.parse(change.textDocument.uri);
			const edits = change.edits.map((edit: any) => vscode.TextEdit.replace(
				new vscode.Range(
					new vscode.Position(edit.range.start.line, edit.range.start.character),
					new vscode.Position(edit.range.end.line, edit.range.end.character)
				),
				edit.newText
			));
			workspaceEdit.set(uri, edits);
		}	
		await vscode.workspace.applyEdit(workspaceEdit);
	}
}