import simpleGit, { SimpleGit } from "simple-git";
import * as vscode from "vscode";
import {
	getLastNotifiedTime,
	getNotificationInterval,
	updateLastNotifiedTime,
} from "./notifications";

async function initializeGitRepository() {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		throw new Error("No workspace folder found");
	}
	const rootPath = workspaceFolders[0].uri.fsPath;
	const repository = simpleGit(rootPath);

	const isRepo = await repository.checkIsRepo();
	if (!isRepo) {
		const userResponse = await vscode.window.showInformationMessage(
			"No Git repository found. Would you like to initialize one?",
			"Yes",
			"No"
		);
		if (userResponse === "Yes") {
			await repository.init();
			vscode.window.showInformationMessage("Git repository initialized.");
		} else {
			vscode.window.showInformationMessage("Git repository not initialized.");
		}
	}
	return repository;
}

export async function checkAndNotify(uri: vscode.Uri) {
	const lastNotified = getLastNotifiedTime(uri);
	const currentTime = new Date().getTime();
	const notificationInterval = getNotificationInterval();

	if (currentTime - lastNotified <= notificationInterval) {
		return;
	}

	const relativePath = vscode.workspace.asRelativePath(uri);
	const repository = await initializeGitRepository();
	const diff = await repository.diff(["HEAD", relativePath]);

	if (diff.length > 0) {
		vscode.window.showWarningMessage(
			`Ensure you've tested the changes in ${relativePath}`,
			"Ok"
		);
		updateLastNotifiedTime(uri, currentTime);
	}
}

export async function createGitRepository(): Promise<SimpleGit> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		throw new Error("No workspace folder found");
	}
	const rootPath = workspaceFolders[0].uri.fsPath;
	return simpleGit(rootPath);
}

export async function getChangedLines(repository: SimpleGit, filePath: string) {
	const diffSummary = await repository.diffSummary(["HEAD", filePath]);
	return diffSummary.files;
}
