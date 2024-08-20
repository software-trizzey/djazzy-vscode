import { Diagnostic, CodeAction } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { LanguageConventions } from '../languageConventions';
import { ExtensionSettings } from '../settings';
import { LanguageProvider } from './languageProvider';


export class PythonProvider extends LanguageProvider {

	provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
		throw new Error('Method not implemented.');
	}

	runDiagnostics(
		document: TextDocument,
		diagnostics: Diagnostic[],
		changedLines: Set<number> | undefined
	): Promise<Diagnostic[]> {
		throw new Error('Method not implemented.');
	}
	
	generateFixForNamingConventionViolation(
		document: TextDocument,
		diagnostic: Diagnostic,
		userToken: string): Promise<CodeAction | undefined> {
		throw new Error('Method not implemented.');
	}

	provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]> {
		throw new Error('Method not implemented.');
	}

	clearNPlusOneCache(): void {
		throw new Error('Method not implemented.');
	}

	getConventions(): LanguageConventions {
		throw new Error('Method not implemented.');
	}

	updateSettings(settings: ExtensionSettings): void {
		throw new Error('Method not implemented.');
	}
}