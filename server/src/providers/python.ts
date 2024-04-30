import * as vscode from "vscode";
import { exec } from "child_process";
import * as path from "path";

import { LanguageProvider } from "./base";
import defaultConventions from "../defaultConventions";
import { DJANGO_RESERVED_NAMES } from "../data/reservedNames";

import { debounce, validatePythonFunctionName } from "../utils";

export class PythonProvider extends LanguageProvider {
	provideDiagnosticsDebounced: (document: vscode.TextDocument) => void;

	constructor(languageId: keyof typeof defaultConventions) {
		super(languageId);

		const timeoutInMilliseconds = 1000;
		this.provideDiagnosticsDebounced = debounce(
			(document) => this.provideDiagnostics(document),
			timeoutInMilliseconds
		);
	}

	provideCodeActions(
		document: vscode.TextDocument
	): Promise<vscode.CodeAction[]> {
		const diagnostics = vscode.languages.getDiagnostics(document.uri);

		const namingConventionDiagnostics = diagnostics.filter(
			(diagnostic) => diagnostic.code === "namingConventionViolation"
		);

		const actionPromise = namingConventionDiagnostics.map((diagnostic) =>
			this.generateFixForNamingConventionViolation(document, diagnostic)
		);

		return Promise.all(actionPromise);
	}

	async generateFixForNamingConventionViolation(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic
	): Promise<vscode.CodeAction> {
		const range = diagnostic.range;
		const fix = new vscode.CodeAction(
			`Rename variable to match conventions`,
			vscode.CodeActionKind.QuickFix
		);
		fix.edit = new vscode.WorkspaceEdit();

		// Here, you would calculate the new name based on your conventions
		// For demonstration, let's just append 'Corrected' to the existing name
		const varName = document.getText(range);
		const correctedName = `${varName}Corrected`;

		fix.edit.replace(document.uri, range, correctedName);

		return fix;
	}

	public async provideDiagnostics(
		document: vscode.TextDocument
	): Promise<void> {
		if (!this.isEnabled) return;

		this.diagnostics.delete(document.uri);
		const diagnostics: vscode.Diagnostic[] = [];
		// TODO: add logic for checking new code only
		const text = document.getText();
		const parserFilePath = this.getParserFilePath(text);
		const process = exec(
			`python3 ${parserFilePath}`,
			async (error, stdout, stderr) => {
				if (error) {
					console.error(`exec error: ${error}`);
					return;
				}
				if (stderr) {
					console.error(`stderr: ${stderr}`);
					return;
				}
				const symbols = JSON.parse(stdout);
				console.log("Symbols:", symbols);
				await this.validateAndCreateDiagnostics(symbols, document, diagnostics);
				this.diagnostics.set(document.uri, diagnostics);
			}
		);

		if (!process.stdin) {
			console.error("Failed to open stdin");
			return;
		}

		process.stdin.write(text);
		process.stdin.end();
	}

	private async validateAndCreateDiagnostics(
		symbols: any[],
		document: vscode.TextDocument,
		diagnostics: vscode.Diagnostic[]
	): Promise<void> {
		for (const symbol of symbols) {
			const { type, name, line, col_offset, end_col_offset, value } = symbol;
			let result = null;

			switch (type) {
				case "function":
					result = await this.validateFunctionName(name);
					break;
				case "variable":
					result = this.validateVariableName({
						variableName: name,
						variableValue: value,
						languageId: this.languageId,
					});
					break;
				case "class":
					// #TODO: Implement class name validation
					console.log("Class:", name);
					break;
				case "django_model":
					// #TODO: Implement model name validation (probably similar to class)
					console.log("Django model:", name);
					break;
				case "django_method":
					if (this.shouldValidateFunctionName(name, "model")) {
						result = await this.validateFunctionName(name);
					}
					break;
				case "django_field":
					result = this.validateVariableName({
						variableName: name,
						variableValue: this.extractDjangoFieldValue(value),
						languageId: this.languageId,
					});
					break;
				case "django_serializer_field":
					// TODO: Handle serializer field validation if different from standard fields
					console.log("Serializer field:", name);
					break;
				case "django_view_method":
					// TODO: Handle method validation in views
					console.log("View method:", name);
					break;
				case "django_test_method":
					// TODO: Handle validation for test methods
					console.log("Test method:", name);
					break;
			}

			if (result && result.violates) {
				const start = new vscode.Position(line, col_offset);
				const end = new vscode.Position(line, end_col_offset);
				const range = new vscode.Range(start, end);
				diagnostics.push(
					new vscode.Diagnostic(
						range,
						result.reason,
						vscode.DiagnosticSeverity.Warning
					)
				);
			}
		}
	}

	private getParserFilePath(text: string): string {
		let parserFilePath = "";
		if (text.includes("from django")) {
			console.log("Django code detected.");
			parserFilePath = path.join(
				__dirname,
				"..",
				"./bundled/tools/python/django_parser.py"
			);
		} else {
			parserFilePath = path.join(
				__dirname,
				"..",
				"./bundled/tools/python/ast_parser.py"
			);
		}
		return parserFilePath;
	}

	private shouldValidateFunctionName(
		method_name: string,
		component_type: "model" | "serializer" | "view"
	): boolean {
		if (DJANGO_RESERVED_NAMES[component_type].includes(method_name)) {
			return false;
		}
		if (
			component_type === "serializer" &&
			method_name.startsWith("validate_")
		) {
			return false;
		}
		return true;
	}

	private extractDjangoFieldValue(fieldValue: string): any {
		if (fieldValue.includes("BooleanField")) {
			return fieldValue.includes("True");
		}
		return undefined;
	}

	private async validateFunctionName(functionName: string): Promise<{
		violates: boolean;
		reason: string;
	}> {
		return await validatePythonFunctionName(functionName);
	}
}
