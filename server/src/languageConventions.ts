interface BooleanRuleSettings {
	positiveNaming: boolean;
	usePrefix: boolean;
}

interface ExpressiveNamesBaseRulesSettings {
	isEnabled: boolean;
	avoidShortNames: boolean;
	avoidGenericNames: boolean;
	examples: string[];
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

interface ExpressiveObjectPropertyNameRulesSettings
	extends ExpressiveNamesBaseRulesSettings {
	// TODO: add support for additional object property conventions
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
		objectProperties: ExpressiveObjectPropertyNameRulesSettings;
	};
	boolean: BooleanRuleSettings;
	file?: FileRuleSettings; // TODO: add support for file conventions
}