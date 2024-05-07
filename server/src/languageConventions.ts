interface BooleanRuleSettings {
	positiveNaming: boolean;
	usePrefix: boolean;
}

interface FileRuleSettings {
	avoidComponentInNonXSuffix: boolean;
	avoidIndexJs: boolean;
	avoidExportDefault: boolean;
}

export interface LanguageConventions {
	isEnabled: boolean;
	expressive: boolean;
	avoidAbbreviation: boolean;
	boolean: BooleanRuleSettings;
	file?: FileRuleSettings; // TODO: add support for file conventions
}
