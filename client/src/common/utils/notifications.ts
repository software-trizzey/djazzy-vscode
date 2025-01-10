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

	const applyMigrationsText = 'Apply Migrations';
	const dismissText = 'Dismiss';
	const unappliedMigrationsText = 'Unapplied migrations detected. Would you like to apply them now?';

    try {
        const { stdout } = await execAsync('python manage.py migrate --check');
        
        if (stdout.includes('unapplied migration(s)')) {
            const choice = await window.showWarningMessage(
                unappliedMigrationsText,
                applyMigrationsText,
                dismissText
            );
            
            if (choice === applyMigrationsText) {
                const terminal = window.createTerminal('Django Migrations');
                terminal.show();
                terminal.sendText('python manage.py migrate');
            }
        }
    } catch (error: any) {
        // If migrate --check returns non-zero exit code, there are unapplied migrations
        if (error.code === 1) {
            const choice = await window.showWarningMessage(
                unappliedMigrationsText,
                applyMigrationsText,
                dismissText
            );
            
            if (choice === applyMigrationsText) {
                const terminal = window.createTerminal('Django Migrations');
                terminal.show();
                terminal.sendText('python manage.py migrate');
            }
        } else {
            console.error('Error checking migrations:', error);
        }
    }
}