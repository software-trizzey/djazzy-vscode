interface RuleSettings {
	expressive: boolean;
	avoidAbbreviation: boolean;
	prefix?: string[];
}

interface BooleanRuleSettings extends RuleSettings {
	positiveNaming: boolean;
}

interface FileRuleSettings {
	avoidComponentInNonXSuffix: boolean;
	avoidIndexJs: boolean;
	avoidExportDefault: boolean;
}

export interface LanguageConventions {
	isEnabled: boolean;
	variable: RuleSettings;
	function: RuleSettings;
	class: RuleSettings;
	boolean: BooleanRuleSettings;
	file?: FileRuleSettings; // TODO: add support for file conventions
}
