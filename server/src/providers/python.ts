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
import { SOURCE_NAME, NAMING_CONVENTION_VIOLATION_SOURCE_TYPE, RENAME_SUGGESTION_PLACEHOLDER } from "../constants/diagnostics";
import { LanguageConventions, CeleryTaskDecoratorSettings } from "../languageConventions";

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
		diagnostic: Diagnostic,
		userToken: string
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
			violationMessage.includes(RULE_MESSAGES.NAME_TOO_SHORT.replace("{name}", flaggedName)) ||
			violationMessage.includes(RULE_MESSAGES.OBJECT_KEY_TOO_SHORT.replace("{name}", flaggedName))
		) {
			suggestedName = RENAME_SUGGESTION_PLACEHOLDER;
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
				suggestedName = RENAME_SUGGESTION_PLACEHOLDER;
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
							changedLines,
							document
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

	sanitizeFunctionBody(body: string): string {
		let lines = body.split('\n');
		lines = lines.slice(1);
	
		const minIndent = lines.reduce((min, line) => {
			if (line.trim().length === 0) return min;
			const matches = line.match(/^\s*/);
			if (!matches) return min;
			const indent = matches[0].length;
			return Math.min(min, indent);
		}, Infinity);
	
		lines = lines.map(line => line.slice(minIndent));
	
		return lines.join('\n');
	}

    async validateAndCreateDiagnostics(
        symbols: any[],
        diagnostics: Diagnostic[],
        changedLines: Set<number> | undefined,
		document: TextDocument
    ): Promise<void> {
        const conventions = this.getConventions();
        for (const symbol of symbols) {
            const {
                type,
                name,
                line,
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
                case "function":
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

                    if (symbol.arguments) {
                        for (const arg of symbol.arguments) {
                            const argumentResult = this.validateVariableName({
                                variableName: arg.name,
                                variableValue: arg.default,
                            });
                            if (argumentResult.violates) {
                                const argRange = Range.create(
                                    Position.create(arg.line - 1, arg.col_offset),
                                    Position.create(arg.line - 1, arg.col_offset + arg.name.length)
                                );
                                diagnostics.push(this.createDiagnostic(
                                    argRange,
                                    argumentResult.reason,
                                    DiagnosticSeverity.Warning
                                ));
                            }
                        }
                    }
                    break;

                case "assignment":
                case "variable":
                    result = this.validateVariableName({
                        variableName: name,
                        variableValue: value,
                    });
                    break;

                case "class":
                    result = this.validateClassName(name);
                    break;

                case "dictionary":
                    result = this.validateDictionary(symbol);
                    if (result.violates && result.diagnostics) {
                        diagnostics.push(...result.diagnostics);
                    }
                    continue; // Skip the general diagnostic creation for dictionaries

                case "list":
                    result = this.validateList(value);
                    break;

                case "for_loop":
                    this.handleForLoopTargets(symbol, diagnostics);
                    continue; // Skip the general diagnostic creation for for loops

                case "django_model":
                    // TODO: Implement model name validation
                    break;

                case "django_model_field":
                case "django_serializer_field":
                    result = this.validateVariableName({
                        variableName: name,
                        variableValue: this.extractDjangoFieldValue(value),
                    });
                    break;
            }

			if (result && result.violates) {
                const { start, end } = this.adjustColumnOffsets(symbol);
                const range = Range.create(
                    Position.create(symbol.line, start),
                    Position.create(symbol.line, end)
                );
                diagnostics.push(this.createDiagnostic(
                    range,
                    result.reason,
                    DiagnosticSeverity.Warning
                ));
            }

            this.handleComments(leading_comments, symbol, diagnostics);
            this.handleCeleryTask(symbol, conventions, diagnostics);
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

	private handleForLoopTargets(symbol: any, diagnostics: Diagnostic[]): void {
        if (symbol.target_positions) {
            for (const [variableName, line, col_offset] of symbol.target_positions) {
                const result = this.validateVariableName({
                    variableName: variableName,
                    variableValue: null,
                });
                if (result.violates) {
                    const range = Range.create(
                        Position.create(line, col_offset),
                        Position.create(line, col_offset + variableName.length)
                    );
                    diagnostics.push(this.createDiagnostic(
                        range,
                        result.reason,
                        DiagnosticSeverity.Warning
                    ));
                }
            }
        }
    }

    private handleComments(comments: any[], symbol: any, diagnostics: Diagnostic[]): void {
        if (this.settings.comments.flagRedundant && comments) {
            for (const comment of comments) {
                const result = this.isCommentRedundant(comment.value, symbol);
                if (result.violates) {
                    const range = Range.create(
                        Position.create(comment.line, comment.col_offset),
                        Position.create(comment.line, comment.end_col_offset)
                    );
                    diagnostics.push(this.createDiagnostic(
                        range,
                        result.reason,
                        DiagnosticSeverity.Warning
                    ));
                }
            }
        }
    }

    private handleCeleryTask(symbol: any, conventions: LanguageConventions, diagnostics: Diagnostic[]): void {
        if (conventions.celeryTaskDecorator && symbol.type === "function") {
            const celeryViolations = this.validateCeleryTask(symbol, conventions.celeryTaskDecorator);
            for (const violation of celeryViolations) {
                const { start, end } = this.adjustColumnOffsets(symbol);
                const range = Range.create(
                    Position.create(symbol.line, start),
                    Position.create(symbol.line, end)
                );
                diagnostics.push(this.createDiagnostic(
                    range,
                    violation,
                    DiagnosticSeverity.Warning
                ));
            }
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

		if (!dictionary.key_and_value_pairs) {
			return { violates: false, reason: "", diagnostics };
		}
	
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
					NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
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

	private validateCeleryTask(
		symbol: any,
		rule: CeleryTaskDecoratorSettings
	): string[] {
		const violations: string[] = [];

		const symbolDecorators: string[] = symbol.decorators || [];
		const symbolCalls: string[] = symbol.calls || [];

		if (!symbolDecorators && !symbolCalls) {
			return violations;
		}

		const celeryDecorators = [
			'shared_task',
			'app.task'
		];
		
		const isCeleryTask = symbolDecorators.some(decorator => 
			celeryDecorators.some(celeryDecorator => decorator.includes(celeryDecorator))
		);
	
		if (!isCeleryTask) {
			return violations;
		}
	
		const missingDecorators = rule.requiredDecorators.filter(requiredDecorator => {
			const parsedDecorator = requiredDecorator.replace(/@/, '').replace(/\(.*\)/, '');
			return !symbolDecorators.some(decorator => decorator.includes(parsedDecorator));
		});
	
		if (missingDecorators.length > 0) {
			violations.push(RULE_MESSAGES.CELERY_TASK_MISSING_DECORATORS.replace(
				"{name}", symbol.name
			).replace("{decorators}", missingDecorators.join(', ')));
		}
	
		const missingCalls = rule.requiredCalls.filter(requiredCall => {
			const parsedCall = requiredCall.replace(/\(.*\)/, '');
			return !symbolCalls.some(symbolCall => symbolCall.includes(parsedCall));
		});
	
		if (missingCalls.length > 0) {
			violations.push(RULE_MESSAGES.CELERY_TASK_MISSING_CALLS.replace(
				"{name}", symbol.name
			).replace("{calls}", missingCalls.join(', '))
			);
		}
	
		return violations;
	}

	private adjustColumnOffsets(symbol: any): { start: number, end: number } {
        let start = symbol.col_offset;
        let end = symbol.end_col_offset || symbol.col_offset + symbol.name.length;

        if (symbol.type === "function" || symbol.type.startsWith("django_") && symbol.type.endsWith("_method")) {
            start += "def ".length;
            end = start + symbol.name.length;
        } else if (symbol.type === "class" || symbol.type === "django_model") {
            start += "class ".length;
            end = start + symbol.name.length;
        }

        return { start, end };
    }
}
