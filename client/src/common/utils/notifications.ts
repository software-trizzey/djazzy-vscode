import { Uri, workspace } from "vscode";

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
		.getConfiguration("whenInRome")
		.get("notificationInterval", TWENTY_MINUTES);
	const intervalInMilliseconds = intervalInMinutes * 60 * 1000;
	return intervalInMilliseconds;
}
