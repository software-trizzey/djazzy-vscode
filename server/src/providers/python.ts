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

import { debounce, validatePythonFunctionName } from "../utils";

import { ExtensionSettings, defaultConventions } from "../settings";
import { PYTHON_DIRECTORY } from "../constants/filepaths";
import { FIX_NAME } from "../constants/commands";
import { RULE_MESSAGES } from '../constants/rules';
import { SOURCE_NAME, SOURCE_TYPE } from "../constants/diagnostics";
import { LanguageConventions } from "../languageConventions";

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

	async generateFixForNamingConventionViolation(
		document: TextDocument,
		diagnostic: Diagnostic
	): Promise<CodeAction | undefined> {
		const flaggedName = document.getText(diagnostic.range);
		const violationMessage = diagnostic.message;
		const cacheKey = `${violationMessage}-${diagnostic.range.start.line}-${diagnostic.range.start.character}`;
		const cachedAction = this.codeActionsMessageCache.get(cacheKey);
		let suggestedName = "";
	
		if (cachedAction) {
			return cachedAction;
		}
		
		if (
			violationMessage.includes(RULE_MESSAGES.VARIABLE_TOO_SHORT.replace("{name}", flaggedName)) ||
			violationMessage.includes(RULE_MESSAGES.OBJECT_KEY_TOO_SHORT.replace("{name}", flaggedName))
		) {
			const response = await this.fetchSuggestedNameFromLLM({
				message: violationMessage,
				modelType: "groq",
				document,
				diagnostic,
			});
			if (!response) return;
			const data = JSON.parse(response);
			suggestedName = data.suggestedName;
		} else if (
			violationMessage.includes(RULE_MESSAGES.BOOLEAN_NO_PREFIX.replace("{name}", flaggedName)) ||
			violationMessage.includes(RULE_MESSAGES.OBJECT_KEY_BOOLEAN_NO_PREFIX.replace("{name}", flaggedName))
		) {
			suggestedName = `is_${flaggedName}`;
		} else if (
			violationMessage.includes(RULE_MESSAGES.BOOLEAN_NEGATIVE_PATTERN.replace("{name}", flaggedName)) ||
			violationMessage.includes(RULE_MESSAGES.OBJECT_KEY_BOOLEAN_NEGATIVE_PATTERN.replace("{name}", flaggedName))
		) {
			suggestedName = flaggedName
				.replace(/_not_([^_]+)/i, (_match, p1) => `_${p1}`)
				.replace(/not_([^_]+)/i, (_match, p1) => `${p1}`)
				.replace(/is_not_/i, "is_")
				.replace(/did_not_/i, "did_")
				.replace(/cannot_/i, "can_")
				.replace(/does_not_/i, "does_")
				.replace(/has_not_/i, "has_")
				.toLowerCase();
		} else if (violationMessage.includes(RULE_MESSAGES.FUNCTION_NO_ACTION_WORD.replace("{name}", flaggedName)) ||
				violationMessage.includes(RULE_MESSAGES.FUNCTION_TOO_SHORT.replace("{name}", flaggedName))) {
			if (this.settings.general.isDevMode) {
				suggestedName = `get${flaggedName}`;
			} else {
				const functionBodyRange = this.getFunctionBodyRange(document, diagnostic.range);
				const functionBody = this.extractFunctionBody(document, functionBodyRange);
				const limitedFunctionBody = this.limitFunctionBodySize(functionBody);
				const response = await this.fetchSuggestedNameFromLLM({
					message: violationMessage,
					functionBody: limitedFunctionBody,
					modelType: "groq",
					diagnostic,
					document,
				});
				if (!response) return;
				const data = JSON.parse(response);
				suggestedName = data.suggestedName;
			}
		}
		const title = `Rename to '${suggestedName}'`;
		const range = diagnostic.range;
		const cmd = Command.create(title, FIX_NAME, document.uri, suggestedName, range);
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
						const errorMessage = `Process exited with code ${code}, stderr: ${error}`;
						console.error(errorMessage);
						return reject(new Error(errorMessage));
					}

					try {
						// FIXME: hack to remove non-JSON output (e.g. "install instructions")
						const jsonLines = output
							.split("\n")
							.filter(
								(line) =>
									line.trim().startsWith("[") || line.trim().startsWith("{")
							);
						const jsonString = jsonLines.join("\n");
						const symbols = JSON.parse(jsonString);
						await this.validateAndCreateDiagnostics(
							symbols,
							diagnostics,
							changedLines
						);

						resolve(diagnostics);
					} catch (err: any) {
						console.error("Failed to parse JSON output:", err, output);
						reject(new Error(`Failed to parse JSON output: ${err.message}`));
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
		const conventions = this.getConventions();
		for (const symbol of symbols) {
			const {
				type,
				name,
				line,
				col_offset,
				value,
				leading_comments,
				body,
				function_start_line,
				function_end_line,
				is_reserved,
			} = symbol;

			if (is_reserved) {
				continue; // Skip validation for reserved symbols
			}

			if (changedLines && !changedLines.has(line)) {
				continue; // Skip validation if line not in changedLines
			}

			let result = null;
			switch (type) {
				case "functiondef":
				case "django_model_method":
				case "django_serializer_method":
				case "django_view_method":
				case "django_testcase_method":
					result = await this.validateFunctionName(
						name,
						{
							content: body,
							bodyLength: function_end_line - function_start_line + 1,
						},
						conventions
					);
					break;
				case "variable":
				case "assignment":
				case "assign":
					result = this.validateVariableName({
						variableName: name,
						variableValue: value,
					});
					break;
				case "classdef":
					result = this.validateClassName(name);
					break;
				case "dictionary":
					result = this.validateDictionary(symbol);

					if (result.violates && result.diagnostics) {
						diagnostics.push(...result.diagnostics);
					}
					break;
				case "list":
					result = this.validateList(value);
					break;
				case "django_model":
					// TODO: Implement model name validation (probably similar to class)
					break;
				case "django_model_field":
					result = this.validateVariableName({
						variableName: name,
						variableValue: this.extractDjangoFieldValue(value),
					});
					break;
				case "django_serializer_field":
					// TODO: Handle serializer field validation if different from standard fields
					break;
			}

			if (result && result.violates) {
				let colOffsetAdjustment = 0;
				if (symbol.type === "function" && symbol.name) {
					colOffsetAdjustment = "def ".length;
				} else if (symbol.type === "class" && symbol.name) {
					colOffsetAdjustment = "class ".length;
				}
				const start = Position.create(line, col_offset + colOffsetAdjustment);
				const end = Position.create(
					line,
					col_offset + colOffsetAdjustment + symbol.name.length
				);
				const range = Range.create(start, end);
				const diagnostic: Diagnostic = Diagnostic.create(
					range,
					result.reason,
					DiagnosticSeverity.Warning,
					SOURCE_TYPE,
					SOURCE_NAME
				);
				diagnostics.push(diagnostic);
			}

			if (this.settings.comments.flagRedundant && leading_comments) {
				for (const comment of leading_comments) {
					this.handleComment(comment, symbol, diagnostics);
				}
			}
		}
	}

	private getParserFilePath(text: string): string {
		let parserFilePath = "";
	
		const djangoPatterns = [
			"from django",
			"import django",
			"from rest_framework",
			"import rest_framework",
			"from .models",       
			"from .views",
			"from .serializers",
			"from .forms",
			"from .admin",
			"import models",       
			"import views",
			"import serializers",
			"import forms",
			"import admin"
		];
	
		const isDjangoFile = djangoPatterns.some(pattern => text.includes(pattern));
		if (isDjangoFile) {
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

	private extractDjangoFieldValue(fieldValue: string): any {
		if (fieldValue.includes("BooleanField")) {
			return fieldValue.includes("True");
		}
		return undefined;
	}

	private async validateFunctionName(
		functionName: string,
		functionBody: { content: string; bodyLength: number },
		languageConventions: LanguageConventions
	): Promise<{
		violates: boolean;
		reason: string;
	}> {
		return await validatePythonFunctionName(
			functionName,
			functionBody,
			languageConventions
		);
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
					SOURCE_NAME
				)
			);
		}
	}

	private validateDictionary(dictionary: any): {
		violates: boolean;
		reason: string;
		diagnostics: Diagnostic[];
	} {
		let hasViolatedRule = false;
		let reason = "";
		const diagnostics: Diagnostic[] = [];
	
		for (const pair of dictionary.key_and_value_pairs) {
			const { key, key_start, key_end, value } = pair;
			
			const validationResult = this.validateObjectPropertyName({
				objectKey: key,
				objectValue: value,
			});
	
			if (validationResult.violates) {
				hasViolatedRule = true;
				reason = validationResult.reason;

				const keyStartPositionWithoutQuote = Position.create(key_start[0], key_start[1] + 1);
				const keyEndPositionWithoutQuote = Position.create(key_end[0], key_end[1] - 1);
				const range = Range.create(keyStartPositionWithoutQuote, keyEndPositionWithoutQuote);
				const diagnostic: Diagnostic = Diagnostic.create(
					range,
					validationResult.reason,
					DiagnosticSeverity.Warning,
					SOURCE_TYPE,
					SOURCE_NAME
				);
				diagnostics.push(diagnostic);
			}
		}
	
		return { violates: hasViolatedRule, reason, diagnostics };
	}
	
	

	private validateList(value: string): { violates: boolean; reason: string } {
		// TODO: Implement your validation logic for lists
		return { violates: false, reason: "" };
	}

	private validateClassName(name: string): {
		violates: boolean;
		reason: string;
	} {
		// TODO: Implement your validation logic for class names
		return { violates: false, reason: "" };
	}
}
