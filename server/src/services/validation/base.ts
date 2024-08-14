import { LanguageConventions } from '../../languageConventions';
import { ExtensionSettings } from '../../settings';


export abstract class BaseValidator {
    private conventions: LanguageConventions;
    private settings: ExtensionSettings;

    constructor(conventions: LanguageConventions, settings: ExtensionSettings) {
        this.conventions = conventions;
        this.settings = settings;
    }

	protected getConventions(): LanguageConventions {
		return this.conventions;
	}

	protected getSettings(): ExtensionSettings {
		return this.settings;
	}
}