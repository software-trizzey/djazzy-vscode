import { Uri, workspace, window, ExtensionContext } from "vscode";
import { EXTENSION_ID } from "../constants";
import { exec } from 'child_process';
import { promisify } from 'util';
import { findVirtualEnvPath } from './python';

const migrationConflictMessage = 'Migration conflict detected. This must be resolved before pending migrations can be applied.';
const pythonVirtualEnvNotFoundMessage = 'No Python virtual environment found';

export const notificationTimes = new Map();
export const TWENTY_MINUTES = 20;

export function getLastNotifiedTime(uri: Uri): number {
	return notificationTimes.get(uri.toString()) || 0;
}

export function updateLastNotifiedTime(uri: Uri, time: number) {
	notificationTimes.set(uri.toString(), time);
}

export function getNotificationInterval(): number {
	const intervalInMinutes = workspace
		.getConfiguration(EXTENSION_ID)
		.get("notificationInterval", TWENTY_MINUTES);
	const intervalInMilliseconds = intervalInMinutes * 60 * 1000;
	return intervalInMilliseconds;
}

export async function createMigrations(workspaceRoot: string | undefined) {
	if (!workspaceRoot) {
		console.error('No workspace folder found');
		return;
	}

	const venvActivate = await findVirtualEnvPath(workspaceRoot);
	if (!venvActivate) {
		window.showErrorMessage(pythonVirtualEnvNotFoundMessage);
		return;
	}
	const terminal = window.createTerminal('Django Migrations');
	terminal.show();
	terminal.sendText(`cd "${workspaceRoot}"`);
	terminal.sendText(`${venvActivate} && python manage.py makemigrations`);
}

async function runMigrations(workspaceRoot: string) {
    console.log('Running migrations...');
    const terminal = window.createTerminal('Django Migrations');
    terminal.show();
    terminal.sendText(`cd "${workspaceRoot}"`);
    terminal.sendText('python manage.py migrate');
}

export async function handleMakemigrationsDetected() {
	const execAsync = promisify(exec);
	const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
	
	if (!workspaceRoot) {
		console.error('No workspace folder found');
		return;
	}

    const venvActivate = await findVirtualEnvPath(workspaceRoot);
	if (!venvActivate) {
		window.showErrorMessage(pythonVirtualEnvNotFoundMessage);
		return;
	}

	const applyMigrationsText = 'Apply Migrations';
	const dismissText = 'Dismiss';
	const unappliedMigrationsText = 'Unapplied migrations detected. Would you like to apply them now?';

	try {
		const { stdout } = await execAsync(`${venvActivate} && python manage.py migrate --check`, {
			cwd: workspaceRoot
		});

		if (stdout.includes('unapplied migration(s)')) {
			const choice = await window.showWarningMessage(
					unappliedMigrationsText,
					applyMigrationsText,
					dismissText
				);
			
			if (choice === applyMigrationsText) {
				await runMigrations(workspaceRoot);
			}
		}
	} catch (error: any) {
		if (error.code === 1) {
            if (error.message.includes('invalid syntax')) {
                window.showWarningMessage(migrationConflictMessage);
                return;
            }

			const choice = await window.showWarningMessage(
				unappliedMigrationsText,
					applyMigrationsText,
					dismissText
				);
			
			if (choice === applyMigrationsText) {
				await runMigrations(workspaceRoot);
			}
		} else {
			console.error('Error checking migrations:', error);
			window.showErrorMessage(`Failed to check migrations: ${error.message}`);
		}
	}
}

export async function checkForPendingMigrations() {
	const execAsync = promisify(exec);
	const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
	
	if (!workspaceRoot) {
		console.error('No workspace folder found');
		return;
	}

	const venvActivate = await findVirtualEnvPath(workspaceRoot);
	if (!venvActivate) {
		window.showErrorMessage(pythonVirtualEnvNotFoundMessage);
		return;
	}

	try {
		console.log('Checking for pending migrations...');
		const { stdout } = await execAsync(`${venvActivate} && python manage.py makemigrations --dry-run`, {
			cwd: workspaceRoot,
			shell: '/bin/bash'
		});
		
		if (stdout.includes('No changes detected')) return;

		const createMigrationsText = 'Create Migration';
		const dismissText = 'Dismiss';
		const newMigrationsText = 'Changes detected in models. Would you like to create a new migration?';

		const choice = await window.showInformationMessage(
			newMigrationsText,
			createMigrationsText,
			dismissText
		);
		
		if (choice === createMigrationsText) {
            console.log("Creating migrations...");
			await createMigrations(workspaceRoot);
		}
	} catch (error: any) {
		console.error('Error checking for pending migrations:', error);
		window.showErrorMessage(`Failed to check for migrations: ${error.message}`);
	}
}

export async function hasUnresolvedMergeConflicts(filePath: string): Promise<boolean> {
    try {
        if (!filePath.endsWith('.py')) return false;

        console.log("Checking for merge conflicts in", filePath);
        const document = await workspace.openTextDocument(filePath);
        const content = document.getText();
        return content.includes('<<<<<<<') && content.includes('>>>>>>>');
    } catch (error) {
        console.error('Error checking for merge conflicts:', error);
        return false;
    }
}

export async function handleMigrationConflict(filePath: string): Promise<boolean> {
    const execAsync = promisify(exec);
    const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
    
    if (!workspaceRoot) {
        console.error('No workspace folder found');
        return false;
    }

    const venvActivate = await findVirtualEnvPath(workspaceRoot);
    if (!venvActivate) {
        window.showErrorMessage(pythonVirtualEnvNotFoundMessage);
        return false;
    }

    try {
        if (!filePath.endsWith('.py')) return false;

        if (await hasUnresolvedMergeConflicts(filePath)) {
            window.showWarningMessage(migrationConflictMessage);
            return false;
        }

        try {
            const { stdout } = await execAsync(`${venvActivate} && python manage.py makemigrations --merge --noinput`, {
                cwd: workspaceRoot,
                shell: '/bin/bash'
            });
            
            if (stdout.includes('Created new merge migration')) {
                window.showInformationMessage('Successfully resolved migration conflicts!');
            }
            
            return true;
            
        } catch (mergeError: any) {
            console.log(mergeError);
            if (!mergeError.stdout?.includes('Conflicting migrations detected')) {
                window.showErrorMessage('Error attempting to merge migrations: ' + mergeError.message);
                return false;
            }
            
            window.showErrorMessage('Unable to automatically resolve migration conflicts. Manual intervention required.');
            return false;
        }
    } catch (error: any) {
        console.error('Error handling migration conflict:', error);
        window.showErrorMessage('Error attempting to resolve migration conflicts: ' + error.message);
        return false;
    }
} 