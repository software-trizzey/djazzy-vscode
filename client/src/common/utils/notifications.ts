import { Uri, workspace, window, ExtensionContext } from "vscode";
import { exec } from 'child_process';
import { EXTENSION_ID } from "../constants";
import { promisify } from 'util';

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

export async function handleMakemigrationsDetected(context: ExtensionContext) {
	const execAsync = promisify(exec);
	const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
	
	if (!workspaceRoot) {
		console.error('No workspace folder found');
		return;
	}

	const applyMigrationsText = 'Apply Migrations';
	const dismissText = 'Dismiss';
	const unappliedMigrationsText = 'Unapplied migrations detected. Would you like to apply them now?';

	async function runMigrations() {
		console.log('Running migrations...');
		const terminal = window.createTerminal('Django Migrations');
		terminal.show();
		terminal.sendText(`cd "${workspaceRoot}"`);
		terminal.sendText('python manage.py migrate');
	}

	try {
		const { stdout } = await execAsync('python manage.py migrate --check', {
			cwd: workspaceRoot
		});
		console.log('Migrations check output:', stdout);
		if (stdout.includes('unapplied migration(s)')) {
			const choice = await window.showWarningMessage(
					unappliedMigrationsText,
					applyMigrationsText,
					dismissText
				);
			
			if (choice === applyMigrationsText) {
				await runMigrations();
			}
		}
	} catch (error: any) {
		if (error.code === 1) {
			console.log("Unapplied migrations detected.");
			const choice = await window.showWarningMessage(
				unappliedMigrationsText,
					applyMigrationsText,
					dismissText
				);
			
			if (choice === applyMigrationsText) {
				await runMigrations();
			}
		} else {
			console.error('Error checking migrations:', error);
			window.showErrorMessage(`Failed to check migrations: ${error.message}`);
		}
	}
}