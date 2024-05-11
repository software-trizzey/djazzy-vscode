import type {
	ClientExtensionLanguageSettings,
	LanguageConventions,
} from "./languageConventions";
import type { CommentConventions } from "./commentConventions";

export interface ExtensionSettings {
	onlyCheckNewCode: boolean;
	isDevMode: boolean;
	notificationInterval: number;
	prefixes: string[];
	comments: CommentConventions;
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
	comments: {
		flagRedundant: true,
	},
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

export interface ClientExtensionSettings {
	onlyCheckNewCode: boolean;
	devMode: boolean;
	notificationInterval: number;
	comments: CommentConventions;
	languages: {
		prefixes: string[];
		javascript: ClientExtensionLanguageSettings;
		typescript: ClientExtensionLanguageSettings;
		python: ClientExtensionLanguageSettings;
	};
}

export const normalizeClientSettings = (
	settings: ClientExtensionSettings
): ExtensionSettings => {
	return {
		onlyCheckNewCode: settings.onlyCheckNewCode,
		isDevMode: settings.devMode,
		notificationInterval: settings.notificationInterval,
		prefixes: settings.languages.prefixes,
		comments: settings.comments,
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
