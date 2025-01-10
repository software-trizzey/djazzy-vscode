import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { checkAndNotify } from "./git";
import { handleMakemigrationsDetected } from "./notifications";


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

	folderNames.forEach((folder) => {
		const pattern = new vscode.RelativePattern(
			workspaceFolders[0],
			`**/${folder}/**/*`
		);
		const parentWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		parentWatcher.onDidCreate(async (uri) => {
			console.log(`Parent watcher: New ${folder} folder or file created:`, uri.fsPath);
			
			if (folder === migrationFolder && uri.path.endsWith('.py')) {
				if (uri.path.endsWith('__init__.py') || uri.path.includes('__pycache__')) {
					return;
				}
				
				try {
					const content = await vscode.workspace.fs.readFile(uri);
					const text = Buffer.from(content).toString('utf8');
					
					if (text.includes('class Migration(migrations.Migration)') || 
						text.includes('dependencies = [') ||
						text.includes('operations = [')) {
						await handleMakemigrationsDetected(context);
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


export function setupMigrationWatcher(context: vscode.ExtensionContext) {
    const watcher = vscode.workspace.createFileSystemWatcher(
        '**/migrations/*.py',
        false, // Don't ignore creates
        true,  // Ignore changes
        true   // Ignore deletes
    );

    context.subscriptions.push(
        watcher.onDidCreate(async (uri) => {
            if (uri.path.endsWith('__init__.py') || uri.path.includes('__pycache__')) {
                return;
            }
            
            if (uri.path.includes('/migrations/') && uri.path.endsWith('.py')) {
                try {
                    const content = await vscode.workspace.fs.readFile(uri);
                    const text = Buffer.from(content).toString('utf8');
                    
                    // Check if file contains typical Django migration content
                    if (text.includes('class Migration(migrations.Migration)') || 
                        text.includes('dependencies = [') ||
                        text.includes('operations = [')) {
                        await handleMakemigrationsDetected(context);
                    }
                } catch (err) {
                    console.error('Error reading migration file:', err);
                }
            }
        })
    );

    context.subscriptions.push(watcher);
}