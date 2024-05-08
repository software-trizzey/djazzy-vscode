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
	notificationInterval: 45, // minutes
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
		prefixes: settings.languages.prefixes,
		languages: {
			javascript: normalizeLanguageSettings(settings.languages.javascript),
			typescript: normalizeLanguageSettings(settings.languages.typescript),
			python: normalizeLanguageSettings(settings.languages.python),
		},
	};
};

export const normalizeLanguageSettings = (
	languageSettings: ClientExtensionLanguageSettings
): LanguageConventions => {
	return {
		isEnabled: languageSettings.enabled,
		expressive: languageSettings.expressiveNames,
		avoidAbbreviation: languageSettings.avoidAbbreviations,
		boolean: {
			positiveNaming: languageSettings.boolean.positiveNaming,
			usePrefix: languageSettings.boolean.usePrefix,
		},
	};
};
