import { LanguageConventions } from '../../languageConventions';
import { ExtensionSettings } from '../../settings';


export class NameValidator {
    private conventions: LanguageConventions;
    private settings: ExtensionSettings;

    constructor(conventions: LanguageConventions, settings: ExtensionSettings) {
        this.conventions = conventions;
        this.settings = settings;
    }

    public validateVariableName(variableName: string, variableValue: any): { violates: boolean; reason: string } {
        return { violates: false, reason: '' };
    }

    public validateObjectPropertyName(objectKey: string, objectValue: any): { violates: boolean; reason: string } {
        return { violates: false, reason: '' };
    }
}