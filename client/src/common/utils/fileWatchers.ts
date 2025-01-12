import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { checkAndNotify } from "./git";
import { handleMakemigrationsDetected, checkForPendingMigrations, handleMigrationConflict, hasUnresolvedMergeConflicts } from "./notifications";

async function isModelFile(uri: vscode.Uri): Promise<boolean> {
	try {
		const content = await vscode.workspace.fs.readFile(uri);
		const text = Buffer.from(content).toString('utf8');
		
		return text.includes('from django.db import models') &&
			(text.includes('class') && text.includes('models.Model')) ||
			text.includes('CharField') ||
			text.includes('TextField') ||
			text.includes('ForeignKey') ||
			text.includes('ManyToManyField');
	} catch (err) {
		console.error('Error reading file:', err);
		return false;
	}
}

export async function setupFileWatchers(
	client: LanguageClient,
	context: vscode.ExtensionContext
): Promise<vscode.FileSystemWatcher[]> {
	const migrationFolder = "migrations";    
	const folderNames = ["api", "views", migrationFolder];
	const workspaceFolders = vscode.workspace.workspaceFolders;

	if (!workspaceFolders) {
		console.error("No workspace folders found.");
		return [];
	}

	const watchers: vscode.FileSystemWatcher[] = [];
	const modelWatcher = vscode.workspace.createFileSystemWatcher(
		new vscode.RelativePattern(workspaceFolders[0], '**/*.py')
	);

	modelWatcher.onDidChange(async (uri) => {
		try {
			if (!uri.path.endsWith('.py')) return;

			// This guards against crash during isModelFile check
			if (await hasUnresolvedMergeConflicts(uri.fsPath)) {
				console.log("Waiting for merge conflicts to be resolved...");
				return;
			}

			if (!uri.path.includes(`/${migrationFolder}/`) && await isModelFile(uri)) {
				const resolved = await handleMigrationConflict(uri.fsPath);
				if (!resolved) return;

				// If we resolved conflicts, wait a bit for the file system to update
				await new Promise(resolve => setTimeout(resolve, 1500));
				await checkForPendingMigrations();
			}
		} catch (error) {
			console.error('Error in file watcher:', error);
		}
	});

	context.subscriptions.push(modelWatcher);
	watchers.push(modelWatcher);

	folderNames.forEach((folder) => {
		const pattern = new vscode.RelativePattern(
			workspaceFolders[0],
			`**/${folder}/**/*`
		);
		const parentWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		parentWatcher.onDidCreate(async (uri) => {
			if (uri.path.includes('.pyc')) return;

			console.log(`Parent watcher: New ${folder} folder or file created:`, uri.fsPath);

			if (folder === migrationFolder && uri.path.endsWith('.py')) {
				if (uri.path.endsWith('__init__.py') || uri.path.includes('__pycache__')) {
					return;
				}

				if (await hasUnresolvedMergeConflicts(uri.fsPath)) {
					console.log("Waiting for merge conflicts to be resolved...");
					return;
				}
				
				try {
					console.log("Checking for makemigrations in ", uri.fsPath);
					const content = await vscode.workspace.fs.readFile(uri);
					const text = Buffer.from(content).toString('utf8');
					
					if (text.includes('class Migration(migrations.Migration)') || 
						text.includes('dependencies = [') ||
						text.includes('operations = [')) {
						await handleMakemigrationsDetected();
					}
				} catch (err) {
					console.error('Error reading migration file:', err);
				}
			} else {
				checkAndNotify(uri, client, context);
			}
		});

		parentWatcher.onDidChange((uri) => {
			console.log(`Parent watcher: ${folder} folder or file changed:`, uri.fsPath);
			if (folder === migrationFolder && uri.path.endsWith('.py')) {
				return;
			}

			checkAndNotify(uri, client, context);
		});

		parentWatcher.onDidDelete((uri) => {
			if (folder === migrationFolder && uri.path.endsWith('.py')) {
				return;
			}

			console.log(`Parent watcher: ${folder} folder or file deleted:`, uri.fsPath);
		});

		context.subscriptions.push(parentWatcher);
		watchers.push(parentWatcher);
	});

	return watchers;
}