import { RULE_MESSAGES } from '../../constants/rules';
import { LanguageConventions } from '../../languageConventions';
import { ExtensionSettings } from '../../settings';
import { isLikelyBoolean, hasNegativePattern } from '../../utils';
import { RuleCodes } from '../../constants/rules';

import {BaseValidator} from './base';
import { verbDictionary } from '../../data/verbs';

const VARIABLES_TO_IGNORE = [
	"ID",
	"PK",
	"DEBUG",
	"USE_I18N",
	"USE_L10N",
	"USE_TZ",
	"CSRF_COOKIE_SECURE",
	"SESSION_COOKIE_SECURE",
	"SECURE_SSL_REDIRECT",
	"SECURE_HSTS_INCLUDE_SUBDOMAINS"
];

export interface ValidationResult {
	violates: boolean;
	reason: string;
	ruleCode: RuleCodes | null;
}

const defaultReturnValue: ValidationResult = {
	violates: false,
	reason: "",
	ruleCode: null,
};


export class NameValidator extends BaseValidator {

    constructor(conventions: LanguageConventions, settings: ExtensionSettings) {
        super(conventions, settings);
    }

	public validateVariableName({
		variableName,
		variableValue,
	}: {
		variableName: string;
		variableValue: any;
	}): ValidationResult {
		if (!variableName || VARIABLES_TO_IGNORE.includes(variableName.toUpperCase())) {
			return defaultReturnValue;
		}
		const {
			expressiveNames: { variables },
			boolean,
		} = this.getConventions();
	
		if (!variables.isEnabled) return defaultReturnValue;

		const nameWithoutUnderscorePrefix = variableName.startsWith("_") ? variableName.substring(1) : variableName;
	
		if (variables.avoidShortNames && nameWithoutUnderscorePrefix.length < 3) {
			return {
				violates: true,
				reason: RULE_MESSAGES.NAME_TOO_SHORT.replace("{name}", variableName),
				ruleCode: RuleCodes.NAME_TOO_SHORT
			};
		}
		
		const isExplicitBoolean =
			typeof variableValue === "boolean" ||
			/^(true|false)$/i.test(variableValue);
		if (boolean && (isLikelyBoolean(nameWithoutUnderscorePrefix) || isExplicitBoolean)) {
			const settings = this.getSettings();
			const prefixes = settings.general.prefixes;
			const { positiveNaming, usePrefix } = boolean;
			if (
				usePrefix &&
				!prefixes.some((prefix) => nameWithoutUnderscorePrefix.startsWith(prefix))
			) {
				let reason = RULE_MESSAGES.BOOLEAN_NO_PREFIX.replace("{name}", variableName);
				reason += `\n\nCurrent prefixes: ${prefixes.join(", ")}`;
				reason += `\n\nThese can be updated in the extension settings.`;
				return {
					violates: true,
					reason: reason,
					ruleCode: RuleCodes.BOOLEAN_VARIABLE_PREFIX
				};
			}
			if (positiveNaming && hasNegativePattern(nameWithoutUnderscorePrefix)) {
				return {
					violates: true,
					reason: RULE_MESSAGES.BOOLEAN_NEGATIVE_PATTERN.replace("{name}", variableName),
					ruleCode: RuleCodes.BOOLEAN_VARIABLE_POSITIVE_NAMING
				};
			}
		}
		return defaultReturnValue;
	}

	public async validatePythonFunctionName(
		functionName: string,
		functionBody: { content: string; bodyLength: number },
		languageConventions: LanguageConventions
	): Promise<ValidationResult> {
		const {
			expressiveNames: { functions },
		} = languageConventions;
	
		if (functionName === "__init__" || functionName === "__main__" || functionName === "main") {
			return defaultReturnValue;
		}
	
		const functionNameWithoutUnderscorePrefix = functionName.startsWith("_") ? functionName.substring(1) : functionName;
	
		if (functions.avoidShortNames && functionNameWithoutUnderscorePrefix.length <= 3) {
			return {
				violates: true,
				reason: RULE_MESSAGES.FUNCTION_TOO_SHORT.replace("{name}", functionName),
				ruleCode: RuleCodes.NAME_TOO_SHORT
			};
		}
	
		const verb = Object.keys(verbDictionary).find((word) => 
			functionNameWithoutUnderscorePrefix.startsWith(word)
		);
	
		if (!verb) {
			return {
				violates: true,
				reason: RULE_MESSAGES.FUNCTION_NAME_NO_VERB.replace("{name}", functionName),
				ruleCode: RuleCodes.FUNCTION_NAME_NO_VERB
			};
		}
	
		if (functionBody.bodyLength > functions.functionLengthLimit) {
			return {
				violates: true,
				reason: RULE_MESSAGES.FUNCTION_TOO_LONG.replace("{name}", functionName).replace("{limit}", functions.functionLengthLimit.toString()),
				ruleCode: RuleCodes.FUNCTION_TOO_LONG
			};
		}
	
		return defaultReturnValue;
	}	

	public validateObjectPropertyName({
		objectKey,
		objectValue,
	}: {
		objectKey: string;
		objectValue: any;
	}): ValidationResult {
		if (!objectKey) {
			console.warn("No key name found.");
			return defaultReturnValue;
		}

		const {
			expressiveNames: { objectProperties },
			boolean,
		} = this.getConventions();

		if (!objectProperties.isEnabled) return defaultReturnValue;
	
		const nameWithoutUnderscorePrefix = objectKey.startsWith("_") ? objectKey.substring(1) : objectKey;
	
		if (
			nameWithoutUnderscorePrefix.toLowerCase() !== "id" &&
			objectProperties.avoidShortNames &&
			nameWithoutUnderscorePrefix.length <= 2
		) {
			return {
				violates: true,
				reason: RULE_MESSAGES.OBJECT_KEY_TOO_SHORT.replace("{name}", objectKey),
				ruleCode: RuleCodes.NAME_TOO_SHORT
			};
		}

		const isExplicitBoolean =
			typeof objectValue === "boolean" || objectValue?.type === "BooleanLiteral" ||
			/^(true|false)$/i.test(objectValue);
		if (boolean && (isLikelyBoolean(nameWithoutUnderscorePrefix) || isExplicitBoolean)) {
			const settings = this.getSettings();
			const prefixes = settings.general.prefixes;
			const { positiveNaming, usePrefix } = boolean;
			if (
				usePrefix &&
				!prefixes.some((prefix) => nameWithoutUnderscorePrefix.startsWith(prefix))
			) {
				return {
					violates: true,
					reason: RULE_MESSAGES.OBJECT_KEY_BOOLEAN_NO_PREFIX.replace("{name}", objectKey),
					ruleCode: RuleCodes.BOOLEAN_PROPERTY_PREFIX
				};
			}
			if (positiveNaming && hasNegativePattern(nameWithoutUnderscorePrefix)) {
				return {
					violates: true,
					reason: RULE_MESSAGES.OBJECT_KEY_BOOLEAN_NEGATIVE_PATTERN.replace("{name}", objectKey),
					ruleCode: RuleCodes.BOOLEAN_PROPERTY_POSITIVE_NAMING
				};
			}
		}
	
		return defaultReturnValue;
	}

	public validateListName(value: string): ValidationResult {
		console.log("Implement list name validation");
		return defaultReturnValue;
	}

	public validateClassName(name: string): {
		violates: boolean;
		reason: string;
	} {
		console.log("Implement class name validation");
		return defaultReturnValue;
	}
}