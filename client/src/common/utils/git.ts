import simpleGit, { SimpleGit } from "simple-git";
import * as vscode from "vscode";
import {
	getLastNotifiedTime,
	getNotificationInterval,
	updateLastNotifiedTime,
} from "./notifications";
import { LanguageClient } from 'vscode-languageclient/node';
import { COMMANDS } from '../constants';

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

export async function checkAndNotify(uri: vscode.Uri, client: LanguageClient) {
	const lastNotified = getLastNotifiedTime(uri);
	const currentTime = new Date().getTime();
	const notificationInterval = getNotificationInterval();

	if (currentTime - lastNotified <= notificationInterval) {
		console.log("Not enough time has passed since last notification.");
		return;
	}

	const relativePath = vscode.workspace.asRelativePath(uri);
	const repository = await initializeGitRepository();
	const diff = await repository.diff(["HEAD", relativePath]);
	
	const untrackedFiles = await repository.raw(['ls-files', '--others', '--exclude-standard']);
	const isNewFile = untrackedFiles.includes(relativePath);

	if (diff.length > 0 || isNewFile) {
        const response = await client.sendRequest(COMMANDS.CHECK_TESTS_EXISTS, relativePath) as {testExists: boolean};
        if (!response.testExists) {
            vscode.window.showWarningMessage(
                `Test file for "${relativePath}" does not exist. Please add a test file before committing changes.`,
                "Ok"
            );
        } else {
            vscode.window.showWarningMessage(
                `Ensure you've tested the changes in "${relativePath}"`,
                "Ok"
            );
        }
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
