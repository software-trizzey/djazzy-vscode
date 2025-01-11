import { Uri, workspace, window, ExtensionContext } from "vscode";
import { EXTENSION_ID } from "../constants";
import { exec } from 'child_process';
import { promisify } from 'util';
import { findVirtualEnvPath } from './python';

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
		window.showErrorMessage('No Python virtual environment found');
		return;
	}
	const terminal = window.createTerminal('Django Migrations');
	terminal.show();
	terminal.sendText(`cd "${workspaceRoot}"`);
	terminal.sendText(`${venvActivate} && python manage.py makemigrations`);
}

export async function handleMakemigrationsDetected(context: ExtensionContext, showCreateOption: boolean = false) {
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

export async function checkForPendingMigrations(context: ExtensionContext) {
	const execAsync = promisify(exec);
	const workspaceRoot = workspace.workspaceFolders?.[0]?.uri.fsPath;
	
	if (!workspaceRoot) {
		console.error('No workspace folder found');
		return;
	}

	const venvActivate = await findVirtualEnvPath(workspaceRoot);
	if (!venvActivate) {
		window.showErrorMessage('No Python virtual environment found');
		return;
	}

	try {
		console.log('Checking for pending migrations...');
		const { stdout } = await execAsync(`${venvActivate} && python manage.py makemigrations --dry-run`, {
			cwd: workspaceRoot,
			shell: '/bin/bash'
		});
		
		if (stdout.includes('No changes detected')) {
			return;
		}

		const createMigrationsText = 'Create Migration';
		const dismissText = 'Dismiss';
		const newMigrationsText = 'Changes detected in models. Would you like to create a new migration?';

		const choice = await window.showInformationMessage(
			newMigrationsText,
			createMigrationsText,
			dismissText
		);
		
		if (choice === createMigrationsText) {
			await createMigrations(workspaceRoot);
		}
	} catch (error: any) {
		console.error('Error checking for pending migrations:', error);
		window.showErrorMessage(`Failed to check for migrations: ${error.message}`);
	}
}