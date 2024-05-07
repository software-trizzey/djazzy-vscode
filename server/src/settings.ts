import type { LanguageConventions } from "./languageConventions";

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
