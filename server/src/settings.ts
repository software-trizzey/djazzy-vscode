import { URI } from 'vscode-uri';

import { WorkspaceFolder } from 'vscode-languageserver';

export let workspaceRoot = '';
export let settingsVersion: number = 0;
export let cachedUserToken: string | null = null;
export let pythonExecutable: string = '';

export  function setWorkspaceRoot(workspaceFolders: WorkspaceFolder[]): void {
	if (workspaceFolders && workspaceFolders.length > 0) {
        workspaceRoot = convertUriToPath(workspaceFolders[0].uri);
	} else {
		console.warn("No workspace folders found");
		workspaceRoot = '';
	}
}

export function incrementSettingsVersion() {
	settingsVersion++;
}

export function updateCachedUserToken(token: string): void {
	cachedUserToken = token;
}

export function updatePythonExecutablePath(executablePath: string): void {
	pythonExecutable = executablePath;
}
  

export interface ExtensionSettings {
	general: {
		onlyCheckNewCode: boolean;
		notificationInterval: number;
		booleanPrefixes: string[];
		nameLengthLimit: number;
		functionLengthLimit: number;
		ignoredFunctions: string[];
	};
	comments: {
		flagRedundant: boolean;
	}
	lint: {
		select: string[],
		ignore: string[],
	};
}

const defaultGeneralSettings = {
	booleanPrefixes: ['is', 'has', 'can', 'should', 'did'],
	onlyCheckNewCode: false, // FIXME: expose this in the future
	notificationInterval: 45, // FIXME: expose this in the future
	nameLengthLimit: 3, // FIXME: expose this in the future
	functionLengthLimit: 50, // FIXME: expose this in the future
	ignoredFunctions: [], // TODO: maybe expose this in the future
};

export const normalizeClientSettings = (
	settings: ExtensionSettings
): ExtensionSettings => {
	return {
		general: {
			...defaultGeneralSettings,
			booleanPrefixes: settings.general.booleanPrefixes,
		},
		comments: settings.comments,
		lint: settings.lint,
	};
};


function convertUriToPath(uri: string): string {
	const parsedUri = URI.parse(uri);
    const filePath = parsedUri.fsPath;
	return filePath;
}