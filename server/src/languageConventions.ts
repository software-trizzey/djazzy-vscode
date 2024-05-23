interface BooleanRuleSettings {
	positiveNaming: boolean;
	usePrefix: boolean;
}

interface ExpressiveNamesBaseRulesSettings {
	isEnabled: boolean;
	avoidShortNames: boolean;
	avoidGenericNames: boolean;
}

interface ExpressiveVariableNameRulesSettings
	extends ExpressiveNamesBaseRulesSettings {
	// TODO: add support for additional variable conventions
}

interface ExpressiveFunctionNameRulesSettings
	extends ExpressiveNamesBaseRulesSettings {
	functionLengthLimit: number;
	maxCyclomaticComplexity: number;
}

interface FileRuleSettings {
	avoidComponentInNonXSuffix: boolean;
	avoidIndexJs: boolean;
	avoidExportDefault: boolean;
}

// Server settings
export interface LanguageConventions {
	isEnabled: boolean;
	expressiveNames: {
		variables: ExpressiveVariableNameRulesSettings;
		functions: ExpressiveFunctionNameRulesSettings;
	};
	boolean: BooleanRuleSettings;
	file?: FileRuleSettings; // TODO: add support for file conventions
}