import type { LanguageConventions } from "./languageConventions";

export interface ExtensionSettings {
	onlyCheckNewCode: boolean;
	isDevMode: boolean;
	conventions: {
		javascript?: LanguageConventions;
		typescript?: LanguageConventions;
		python?: LanguageConventions;
	};
}

export const defaultPrefixes: string[] = ["is", "has", "should", "can", "did"];

export const defaultSettings: ExtensionSettings = {
	onlyCheckNewCode: false,
	isDevMode: false,
	conventions: {
		javascript: {
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
