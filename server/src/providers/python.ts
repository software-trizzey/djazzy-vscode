import {
	Connection,
	CodeAction,
	CodeActionKind,
	Command,
	Diagnostic,
	DiagnosticSeverity,
	Range,
	Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { spawn } from "child_process";
import * as path from "path";

import { LanguageProvider } from "./base";
import { DJANGO_RESERVED_NAMES } from "../data/reservedNames";

import { debounce, validatePythonFunctionName } from "../utils";

import { ExtensionSettings, defaultConventions } from "../settings";
import { PYTHON_DIRECTORY } from "../constants/filepaths";
import { FIX_NAME } from "../constants/commands";

export class PythonProvider extends LanguageProvider {
	provideDiagnosticsDebounced: (document: TextDocument) => void;

	private codeActionsMessageCache: Map<string, CodeAction> = new Map();

	constructor(
		languageId: keyof typeof defaultConventions.languages,
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
		const diagnostics = document.uri ? this.getDiagnostic(document.uri) : [];
		if (!diagnostics) return [];
		const namingConventionDiagnostics = diagnostics.filter(
			(diagnostic) => diagnostic.code === "namingConventionViolation"
		);
		const actionPromises = namingConventionDiagnostics.map((diagnostic) =>
			this.generateFixForNamingConventionViolation(document, diagnostic)
		);
		return await Promise.all(actionPromises);
	}

	async generateFixForNamingConventionViolation(
		document: TextDocument,
		diagnostic: Diagnostic
	): Promise<CodeAction> {
		const flaggedName = document.getText(diagnostic.range);
		const violationMessage = diagnostic.message;
		const cacheKey = `${violationMessage}-${diagnostic.range.start.line}-${diagnostic.range.start.character}`;
		const cachedAction = this.codeActionsMessageCache.get(cacheKey);
		let suggestedName = "";

		if (cachedAction) {
			return cachedAction;
		}

		if (
			violationMessage.includes(
				'does not follow "snake_case" naming convention'
			)
		) {
			const snakeCasedName = flaggedName
				.replace(/([A-Z])/g, "_$1")
				.toLowerCase()
				.replace(/[- ]+/g, "_");
			suggestedName = snakeCasedName;
		} else if (violationMessage.includes("has a negative naming pattern")) {
			// detect _not_ and not_ patterns
			suggestedName = flaggedName
				.replace(/_not_([^_]+)/i, (_match, p1) => `_${p1}`)
				.replace(/not_([^_]+)/i, (_match, p1) => `${p1}`);
			// provide suggestions
			suggestedName = suggestedName
				.replace(/is_not_/i, "is_")
				.replace(/did_not_/i, "did_")
				.replace(/cannot_/i, "can_")
				.replace(/does_not_/i, "does_")
				.replace(/has_not_/i, "has_")
				.toLowerCase();
		} else if (
			violationMessage.includes("does not start with a recognized action word")
		) {
			if (this.settings.isDevMode) {
				suggestedName = `get${flaggedName}`;
			} else {
				const response = await this.fetchSuggestedNameFromLLM({
					message: violationMessage,
					modelType: "groq",
				});
				const data = JSON.parse(response);
				suggestedName = data.suggestedName;
				// TODO: Provide justification for action words?
				// const justification = data.justification;
			}
		}
		const title = `Rename to '${suggestedName}'`;
		const range = diagnostic.range;
		const cmd = Command.create(
			title,
			FIX_NAME,
			document.uri,
			suggestedName,
			range
		);
		const fix = CodeAction.create(title, cmd, CodeActionKind.QuickFix);
		fix.isPreferred = true;
		fix.diagnostics = [diagnostic];
		this.codeActionsMessageCache.set(cacheKey, fix);
		return fix;
	}

	public async runDiagnostics(
		document: TextDocument,
		diagnostics: Diagnostic[],
		changedLines: Set<number> | undefined
	): Promise<Diagnostic[]> {
		try {
			const text = document.getText();
			const parserFilePath = this.getParserFilePath(text);

			return new Promise((resolve, reject) => {
				const process = spawn("python3", [parserFilePath]);
				let output = "";
				let error = "";

				process.stdout.on("data", (data) => {
					output += data.toString();
				});
				process.stderr.on("data", (data) => {
					error += data.toString();
				});

				process.on("close", async (code) => {
					if (code !== 0) {
						console.error(`Process exited with code ${code}, stderr: ${error}`);
						return;
					}

					try {
						const symbols = JSON.parse(output);
						await this.validateAndCreateDiagnostics(
							symbols,
							diagnostics,
							changedLines
						);

						resolve(diagnostics);
					} catch (err) {
						console.error("Failed to parse JSON output:", err);
						reject(err);
					}
				});

				if (process.stdin) {
					process.stdin.write(text);
					process.stdin.end();
				}
			});
		} catch (error: any) {
			this.handleError(error);
			return [];
		}
	}

	private async validateAndCreateDiagnostics(
		symbols: any[],
		diagnostics: Diagnostic[],
		changedLines: Set<number> | undefined
	): Promise<void> {
		for (const symbol of symbols) {
			const {
				type,
				name,
				line,
				col_offset,
				end_col_offset,
				value,
				leading_comments,
			} = symbol;

			if (changedLines && !changedLines.has(line)) {
				continue; // Skip validation if line not in changedLines
			}

			let result = null;
			switch (type) {
				case "functiondef":
					result = await this.validateFunctionName(name);
					break;
				case "name":
					result = this.validateVariableName({
						variableName: name,
						variableValue: value,
					});
					break;
				case "classdef":
					// TODO: Implement class name validation
					console.log("Class:", name);
					break;
				case "django_model":
					// TODO: Implement model name validation (probably similar to class)
					console.log("Django model:", name);
					break;
				case "django_method":
					if (this.shouldValidateFunctionName(name, "model")) {
						result = await this.validateFunctionName(name);
					}
					break;
				case "django_model_field":
					result = this.validateVariableName({
						variableName: name,
						variableValue: this.extractDjangoFieldValue(value),
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
				case "assignment":
					console.log("Assignment:", name);
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
			console.log("symbol:", symbol);

			if (this.settings.comments.flagRedundant && leading_comments) {
				for (const comment of leading_comments) {
					this.handleComment(comment, symbol, diagnostics);
				}
			}
		}
	}

	private getParserFilePath(text: string): string {
		let parserFilePath = "";
		if (text.includes("from django")) {
			parserFilePath = path.join(
				__dirname,
				"..",
				"..",
				`./${PYTHON_DIRECTORY}/django_parser.py`
			);
		} else {
			parserFilePath = path.join(
				__dirname,
				"..",
				"..",
				`./${PYTHON_DIRECTORY}/ast_parser.py`
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

	private handleComment(
		comment: any,
		currentSymbol: any,
		diagnostics: Diagnostic[]
	) {
		const result = this.isCommentRedundant(comment.value, currentSymbol);
		if (result.violates) {
			const start = Position.create(comment.line, comment.col_offset);
			const end = Position.create(comment.line, comment.end_col_offset);
			diagnostics.push(
				Diagnostic.create(
					Range.create(start, end),
					result.reason,
					DiagnosticSeverity.Warning,
					undefined,
					"When in Rome"
				)
			);
		}
	}
}
