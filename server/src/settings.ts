import type {
	ClientExtensionSettings,
	ClientExtensionLanguageSettings,
	LanguageConventions,
} from "./languageConventions";

export interface ExtensionSettings {
	onlyCheckNewCode: boolean;
	isDevMode: boolean;
	notificationInterval: number;
	prefixes: string[];
	languages: {
		javascript?: LanguageConventions;
		typescript?: LanguageConventions;
		python?: LanguageConventions;
	};
}

export const defaultPrefixes: string[] = ["is", "has", "should", "can", "did"];

export const defaultConventions: ExtensionSettings = {
	onlyCheckNewCode: false,
	isDevMode: false,
	notificationInterval: 20, // minutes
	prefixes: defaultPrefixes,
	languages: {
		javascript: {
			isEnabled: true,
			expressive: true,
			avoidAbbreviation: true,
			boolean: {
				positiveNaming: true,
				usePrefix: true,
			},
		},
		typescript: {
			isEnabled: true,
			expressive: true,
			avoidAbbreviation: true,
			boolean: {
				positiveNaming: true,
				usePrefix: true,
			},
		},
		python: {
			isEnabled: true,
			expressive: true,
			avoidAbbreviation: true,
			boolean: {
				positiveNaming: true,
				usePrefix: true,
			},
		},
	},
};

export const normalizeClientSettings = (
	settings: ClientExtensionSettings
): ExtensionSettings => {
	return {
		onlyCheckNewCode: settings.onlyCheckNewCode,
		isDevMode: settings.devMode,
		notificationInterval: settings.notificationInterval,
		prefixes: settings.prefixes,
		languages: {
			javascript: normalizeLanguageSettings(settings.languages.javascript),
			typescript: normalizeLanguageSettings(settings.languages.typescript),
			python: normalizeLanguageSettings(settings.languages.python),
		},
	};
};

export const normalizeLanguageSettings = (
	langSettings: ClientExtensionLanguageSettings
): LanguageConventions => {
	return {
		isEnabled: langSettings.enabled,
		expressive: langSettings.expressiveNames,
		avoidAbbreviation: langSettings.avoidAbbreviations,
		boolean: {
			positiveNaming: langSettings.boolean.positiveNaming,
			usePrefix: langSettings.boolean.usePrefix,
		},
	};
};
