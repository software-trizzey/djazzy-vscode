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

interface ThemeSystemRuleSettings {
	isEnabled: boolean;
	shouldFlagHexCodes: boolean;
}

export interface CeleryTaskDecoratorSettings {
	requiredDecorators: string[];
	requiredCalls: string[];
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
	themeSystem?: ThemeSystemRuleSettings;
	celeryTaskDecorator?: CeleryTaskDecoratorSettings;
	file?: FileRuleSettings; // TODO: add support for file conventions
}