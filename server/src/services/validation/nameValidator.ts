import { RULE_MESSAGES } from '../../constants/rules';
import { LanguageConventions } from '../../languageConventions';
import { ExtensionSettings } from '../../settings';
import { isLikelyBoolean, hasNegativePattern } from '../../utils';

import {BaseValidator} from './base';

const VARIABLES_TO_IGNORE = [
	"ID", "PK", "DEBUG", "USE_I18N", "USE_L10N", "USE_TZ", "CSRF_COOKIE_SECURE", "SESSION_COOKIE_SECURE"
];


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
	}): { violates: boolean; reason: string } {
		if (!variableName || VARIABLES_TO_IGNORE.includes(variableName.toUpperCase())) {
			return { violates: false, reason: "" };
		}
		const {
			expressiveNames: { variables },
			boolean,
		} = this.getConventions();
	
		if (!variables.isEnabled) return { violates: false, reason: "" };

		const nameWithoutUnderscorePrefix = variableName.startsWith("_") ? variableName.substring(1) : variableName;
	
		if (variables.avoidShortNames && nameWithoutUnderscorePrefix.length < 3) {
			return {
				violates: true,
				reason: RULE_MESSAGES.NAME_TOO_SHORT.replace("{name}", variableName),
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
				return {
					violates: true,
					reason: RULE_MESSAGES.BOOLEAN_NO_PREFIX.replace("{name}", variableName),
				};
			}
			if (positiveNaming && hasNegativePattern(nameWithoutUnderscorePrefix)) {
				return {
					violates: true,
					reason: RULE_MESSAGES.BOOLEAN_NEGATIVE_PATTERN.replace("{name}", variableName),
				};
			}
		}
		return { violates: false, reason: "" };
	}

	public validateObjectPropertyName({
		objectKey,
		objectValue,
	}: {
		objectKey: string;
		objectValue: any;
	}): { violates: boolean; reason: string } {
		if (!objectKey) {
			console.warn("No key name found.");
			return { violates: false, reason: "" };
		}

		const {
			expressiveNames: { objectProperties },
			boolean,
		} = this.getConventions();

		if (!objectProperties.isEnabled) return { violates: false, reason: "" };
	
		const nameWithoutUnderscorePrefix = objectKey.startsWith("_") ? objectKey.substring(1) : objectKey;
	
		if (
			nameWithoutUnderscorePrefix.toLowerCase() !== "id" &&
			objectProperties.avoidShortNames &&
			nameWithoutUnderscorePrefix.length <= 2
		) {
			return {
				violates: true,
				reason: RULE_MESSAGES.OBJECT_KEY_TOO_SHORT.replace("{name}", objectKey),
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
				};
			}
			if (positiveNaming && hasNegativePattern(nameWithoutUnderscorePrefix)) {
				return {
					violates: true,
					reason: RULE_MESSAGES.OBJECT_KEY_BOOLEAN_NEGATIVE_PATTERN.replace("{name}", objectKey),
				};
			}
		}
	
		return { violates: false, reason: "" };
	}

	public validateListName(value: string): { violates: boolean; reason: string } {
		console.log("Implement list name validation");
		return { violates: false, reason: "" };
	}

	public validateClassName(name: string): {
		violates: boolean;
		reason: string;
	} {
		console.log("Implement class name validation");
		return { violates: false, reason: "" };
	}
}