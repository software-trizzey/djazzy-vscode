import { BaseValidator } from './base';
import { RULE_MESSAGES } from '../../constants/rules';
import { LanguageConventions } from '../../languageConventions';
import { ThemeSystemViolation } from '../../llm/types';
import { ExtensionSettings } from '../../settings';


export class ThemeValidator extends BaseValidator {

    constructor(conventions: LanguageConventions, settings: ExtensionSettings) {
        super(conventions, settings);
    }

	public validateThemeSystemUsage(code: string): ThemeSystemViolation[]{
		const { themeSystem } = this.getConventions();
		if (!themeSystem?.isEnabled) {
			return [];
		}

		const violations:  ThemeSystemViolation[] = [];
		const regexHex = /#[0-9a-fA-F]{3,6}\b/g;
		
		if (themeSystem.shouldFlagHexCodes) {
			let match;
			while ((match = regexHex.exec(code)) !== null) {
				const foundHexCode = match[0];
				violations.push({
					reason: RULE_MESSAGES.THEME_SYSTEM_VIOLATION_HEXCODES.replace("{value}", foundHexCode),
					violates: true,
					index: match.index,
					value: foundHexCode
				});
			}
		}
	
		return violations;
	}
}