import { URI } from 'vscode-uri';

import type { LanguageConventions } from "./languageConventions";
import type { CommentConventions } from "./commentConventions";

export let workspaceRoot = '';
export let settingsVersion: number = 0;
export let cachedUserToken: string | null = null;

export  function setWorkspaceRoot(workspaceFolders: any): void {
	if (workspaceFolders && workspaceFolders.length > 0) {
        workspaceRoot = uriToPath(workspaceFolders[0].uri);
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
  

export interface ExtensionSettings {
	general: {
		onlyCheckNewCode: boolean;
		isDevMode: boolean;
		notificationInterval: number;
		prefixes: string[];
	};
	comments: CommentConventions;
	languages: {
		javascript: LanguageConventions;
		typescript: LanguageConventions;
		python: LanguageConventions;
		javascriptreact: LanguageConventions;
		typescriptreact: LanguageConventions;
	};
}

export const defaultPrefixes: string[] = ["is", "has", "should", "can", "did"];
export const defaultFunctionLengthLimit: number = 60;
export const maxCyclomaticComplexity: number = 10;


const defaultLanguageConventions: LanguageConventions = {
	isEnabled: true,
	expressiveNames: {
		variables: {
			isEnabled: true,
			avoidShortNames: true,
			avoidGenericNames: true,
			examples: [],
		},
		functions: {
			isEnabled: true,
			avoidShortNames: true,
			avoidGenericNames: true,
			functionLengthLimit: defaultFunctionLengthLimit,
			maxCyclomaticComplexity: maxCyclomaticComplexity,
			examples: [],
		},
		objectProperties: {
			isEnabled: true,
			avoidShortNames: true,
			avoidGenericNames: true,
			examples: [],
		}
	},
	boolean: {
		positiveNaming: true,
		usePrefix: true,
	},
	themeSystem: {
		isEnabled: true,
		shouldFlagHexCodes: true,
	},
};

export const defaultConventions: ExtensionSettings = {
	general: {
		onlyCheckNewCode: false,
		isDevMode: false,
		notificationInterval: 45, // minutes
		prefixes: defaultPrefixes,
	},
	comments: {
		flagRedundant: true,
	},
	languages: {
		javascript: defaultLanguageConventions,
		typescript: defaultLanguageConventions,
		javascriptreact: defaultLanguageConventions,
		typescriptreact: defaultLanguageConventions,
		python: {
			...defaultLanguageConventions,
			themeSystem: {
				isEnabled: false,
				shouldFlagHexCodes: false,
			},
			celeryTaskDecorator: {
				requiredDecorators: [],
				requiredCalls: [],
			}
		},
	},
};

export const normalizeClientSettings = (
	settings: ExtensionSettings
): ExtensionSettings => {
	// TODO: throw error if any of the settings are missing or misconfigured
	return {
		general: {
			onlyCheckNewCode: settings.general.onlyCheckNewCode,
			isDevMode: settings.general.isDevMode,
			notificationInterval: settings.general.notificationInterval,
			prefixes: settings.general.prefixes,
		},
		comments: settings.comments,
		languages: {
			javascript: normalizeLanguageSettings(settings.languages.javascript),
			typescript: normalizeLanguageSettings(settings.languages.typescript),
			// FIXME: for now we just use the same settings for react as for the base language
			javascriptreact: normalizeLanguageSettings(settings.languages.javascript),
			typescriptreact: normalizeLanguageSettings(settings.languages.typescript),
			python: normalizeLanguageSettings(settings.languages.python),
		},
	};
};

export const normalizeLanguageSettings = (
	languageSettings: LanguageConventions
): LanguageConventions => {
	// TODO: throw error if any of the settings are missing or misconfigured
	return {
		isEnabled: languageSettings.isEnabled,
		expressiveNames: {
			variables: {
				isEnabled: languageSettings.expressiveNames.variables.isEnabled,
				avoidShortNames:
					languageSettings.expressiveNames.variables.avoidShortNames,
				avoidGenericNames:
					languageSettings.expressiveNames.variables.avoidGenericNames,
					examples: languageSettings.expressiveNames.variables.examples,
			},
			functions: {
				isEnabled: languageSettings.expressiveNames.functions.isEnabled,
				avoidShortNames:
					languageSettings.expressiveNames.functions.avoidShortNames,
				avoidGenericNames:
					languageSettings.expressiveNames.functions.avoidGenericNames,
				functionLengthLimit:
					languageSettings.expressiveNames.functions.functionLengthLimit,
				maxCyclomaticComplexity:
					languageSettings.expressiveNames.functions.maxCyclomaticComplexity,
					examples: languageSettings.expressiveNames.functions.examples,
			},
			objectProperties: {
				isEnabled: languageSettings.expressiveNames.objectProperties.isEnabled,
				avoidShortNames:
					languageSettings.expressiveNames.objectProperties.avoidShortNames,
				avoidGenericNames:
					languageSettings.expressiveNames.objectProperties.avoidGenericNames,
					examples: languageSettings.expressiveNames.objectProperties.examples,
			},
		},
		boolean: {
			positiveNaming: languageSettings.boolean.positiveNaming,
			usePrefix: languageSettings.boolean.usePrefix,
		},
		celeryTaskDecorator: languageSettings.celeryTaskDecorator,
		themeSystem: languageSettings.themeSystem,
	};
};


function uriToPath(uri: string): string {
	const parsedUri = URI.parse(uri);
    const filePath = parsedUri.fsPath;
	return filePath;
}