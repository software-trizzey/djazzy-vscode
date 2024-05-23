import type { LanguageConventions } from "./languageConventions";
import type { CommentConventions } from "./commentConventions";

export let settingsVersion: number = 0;

export function incrementSettingsVersion() {
	settingsVersion++;
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
	};
}

export const defaultPrefixes: string[] = ["is", "has", "should", "can", "did"];
export const defaultFunctionLengthLimit: number = 60;
export const maxCyclomaticComplexity: number = 10;

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
		javascript: {
			isEnabled: true,
			expressiveNames: {
				variables: {
					isEnabled: true,
					avoidShortNames: true,
					avoidGenericNames: true,
				},
				functions: {
					isEnabled: true,
					avoidShortNames: true,
					avoidGenericNames: true,
					functionLengthLimit: defaultFunctionLengthLimit,
					maxCyclomaticComplexity: maxCyclomaticComplexity,
				},
			},
			boolean: {
				positiveNaming: true,
				usePrefix: true,
			},
		},
		typescript: {
			isEnabled: true,
			expressiveNames: {
				variables: {
					isEnabled: true,
					avoidShortNames: true,
					avoidGenericNames: true,
				},
				functions: {
					isEnabled: true,
					avoidShortNames: true,
					avoidGenericNames: true,
					functionLengthLimit: defaultFunctionLengthLimit,
					maxCyclomaticComplexity: maxCyclomaticComplexity,
				},
			},
			boolean: {
				positiveNaming: true,
				usePrefix: true,
			},
		},
		python: {
			isEnabled: true,
			expressiveNames: {
				variables: {
					isEnabled: true,
					avoidShortNames: true,
					avoidGenericNames: true,
				},
				functions: {
					isEnabled: true,
					avoidShortNames: true,
					avoidGenericNames: true,
					functionLengthLimit: defaultFunctionLengthLimit,
					maxCyclomaticComplexity: maxCyclomaticComplexity,
				},
			},
			boolean: {
				positiveNaming: true,
				usePrefix: true,
			},
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
			},
		},
		boolean: {
			positiveNaming: languageSettings.boolean.positiveNaming,
			usePrefix: languageSettings.boolean.usePrefix,
		},
	};
};
