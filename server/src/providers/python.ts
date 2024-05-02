import {
	Connection,
	CodeAction,
	CodeActionKind,
	Diagnostic,
	DiagnosticSeverity,
	Range,
	Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { exec } from "child_process";
import * as path from "path";

import { LanguageProvider } from "./base";
import defaultConventions from "../defaultConventions";
import { DJANGO_RESERVED_NAMES } from "../data/reservedNames";

import { debounce, validatePythonFunctionName } from "../utils";

import { ExtensionSettings } from "../settings";

export class PythonProvider extends LanguageProvider {
	provideDiagnosticsDebounced: (document: TextDocument) => void;

	constructor(
		languageId: keyof typeof defaultConventions,
		connection: Connection,
		settings: ExtensionSettings
	) {
		super(languageId, connection, settings);

		const timeoutInMilliseconds = 1000;
		this.provideDiagnosticsDebounced = debounce(
			(document) => this.provideDiagnostics(document),
			timeoutInMilliseconds
		);
	}

	async provideCodeActions(document: TextDocument): Promise<CodeAction[]> {
		console.log("Providing code actions for", document.uri);
		const diagnostics = document.uri ? this.diagnostics.get(document.uri) : [];
		console.log("Diagnostics", diagnostics);
		if (!diagnostics) return [];
		const namingConventionDiagnostics = diagnostics.filter(
			(diagnostic) => diagnostic.code === "namingConventionViolation"
		);
		console.log("Naming convention diagnostics", namingConventionDiagnostics);
		// TODO: Implement code actions for Python
		console.log("PYTHON CODE ACTIONS");
		// const actionPromises = namingConventionDiagnostics.map((diagnostic) =>
		// 	this.generateFixForNamingConventionViolation(document, diagnostic)
		// );
		return await Promise.all([]);
	}

	async generateFixForNamingConventionViolation(
		document: TextDocument,
		diagnostic: Diagnostic
	): Promise<CodeAction> {
		const range = diagnostic.range;
		const fix = CodeAction.create(
			`Rename variable to match conventions`,
			CodeActionKind.QuickFix
		);
		// fix.edit = new WorkspaceEdit();
		// const varName = document.getText(range);
		// const correctedName = `${varName}Corrected`;
		// fix.edit.replace(document.uri, range, correctedName);

		return fix;
	}

	public async provideDiagnostics(
		document: TextDocument
	): Promise<Diagnostic[] | undefined> {
		if (!this.isEnabled) return;

		this.diagnostics.delete(document.uri);
		const diagnostics: Diagnostic[] = [];
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
		document: TextDocument,
		diagnostics: Diagnostic[]
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
				const start = Position.create(line, col_offset);
				const end = Position.create(line, end_col_offset);
				const range = Range.create(start, end);
				const diagnostic: Diagnostic = Diagnostic.create(
					range,
					result.reason,
					DiagnosticSeverity.Warning,
					"namingConventionViolation",
					"whenInRome"
				);
				diagnostics.push(diagnostic);
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
