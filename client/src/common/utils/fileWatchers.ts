import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { checkAndNotify } from "./git";


export async function setupFileWatchers(
	client: LanguageClient,
	context: vscode.ExtensionContext
): Promise<vscode.FileSystemWatcher[]> {
	const folderNames = ["api", "views"];
	const workspaceFolders = vscode.workspace.workspaceFolders;

	if (!workspaceFolders) {
		console.error("No workspace folders found.");
		return [];
	}

	const watchers: vscode.FileSystemWatcher[] = [];

	folderNames.forEach((folder) => {
		const pattern = new vscode.RelativePattern(
			workspaceFolders[0],
			`**/${folder}/**/*`
		);
		const parentWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		parentWatcher.onDidCreate((uri) => {
			console.log(`Parent watcher: New ${folder} folder or file created:`, uri.fsPath);
			checkAndNotify(uri, client, context);
		});

		parentWatcher.onDidChange((uri) => {
			console.log(`Parent watcher: ${folder} folder or file changed:`, uri.fsPath);
			checkAndNotify(uri, client, context);
		});

		parentWatcher.onDidDelete((uri) => {
			console.log(`Parent watcher: ${folder} folder or file deleted:`, uri.fsPath);
			// TODO: should we alert user that this folder/file was important?
		});

		context.subscriptions.push(parentWatcher);
		watchers.push(parentWatcher);
	});

	return watchers;
}
