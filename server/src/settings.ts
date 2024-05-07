import type { LanguageConventions } from "./languageConventions";

export interface ExtensionSettings {
	onlyCheckNewCode: boolean;
	isDevMode: boolean;
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
	languages: {
		javascript: {
			isEnabled: true,
			variable: {
				expressive: true,
				avoidAbbreviation: true,
			},
			function: {
				expressive: true,
				avoidAbbreviation: true,
			},
			class: {
				expressive: true,
				avoidAbbreviation: true,
			},
			boolean: {
				positiveNaming: true,
				expressive: true,
				avoidAbbreviation: true,
				prefix: defaultPrefixes,
			},
		},
		typescript: {
			isEnabled: true,
			variable: {
				expressive: true,
				avoidAbbreviation: true,
			},
			function: {
				expressive: true,
				avoidAbbreviation: true,
			},
			class: {
				expressive: true,
				avoidAbbreviation: true,
			},
			boolean: {
				positiveNaming: true,
				expressive: true,
				avoidAbbreviation: true,
				prefix: defaultPrefixes,
			},
		},
		python: {
			isEnabled: true,
			variable: {
				expressive: true,
				avoidAbbreviation: true,
			},
			function: {
				expressive: true,
				avoidAbbreviation: true,
			},
			class: {
				expressive: true,
				avoidAbbreviation: true,
			},
			boolean: {
				positiveNaming: true,
				expressive: true,
				avoidAbbreviation: true,
				prefix: defaultPrefixes,
			},
		},
	},
};
