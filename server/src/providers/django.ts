import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
    Connection,
	CodeAction,
	CodeActionKind,
    Command,
    Position,
} from "vscode-languageserver/node";
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createHash } from 'crypto';

import { SOURCE_NAME, DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE, DJANGO_SECURITY_VIOLATION_SOURCE_TYPE, NAMING_CONVENTION_VIOLATION_SOURCE_TYPE, REDUNDANT_COMMENT_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { ExtensionSettings, cachedUserToken, defaultConventions } from "../settings";
import LOGGER from '../common/logs';
import COMMANDS, { ACCESS_FORBIDDEN_NOTIFICATION_ID, FIX_NAME, RATE_LIMIT_NOTIFICATION_ID } from '../constants/commands';
import { Issue, Models, Severity, SymbolFunctionTypes } from '../llm/types';
import { spawn } from 'child_process';
import path from 'path';
import { PYTHON_DIRECTORY } from '../constants/filepaths';
import { RULE_MESSAGES } from '../constants/rules';
import { LanguageConventions, CeleryTaskDecoratorSettings } from '../languageConventions';
import { debounce, validatePythonFunctionName } from '../utils';
import { LanguageProvider } from './base';


interface CachedResult {
    diagnostics: Diagnostic[];
    timestamp: number;
}

const FIVE_MINUTES = 5 * 60 * 1000;
const symbolFunctionTypeList = Object.values(SymbolFunctionTypes);

export class DjangoProvider extends LanguageProvider {

    provideDiagnosticsDebounced: (document: TextDocument) => void;

	private symbols: any[] = [];
	private codeActionsMessageCache: Map<string, CodeAction> = new Map();
    private nPlusOnecache: Map<string, CachedResult> = new Map();
    private cacheTTL: number = FIVE_MINUTES;

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
		let suggestedName: string | undefined = "";
	
		if (cachedAction) {
			return cachedAction;
		}
		
		if (
			violationMessage.includes(RULE_MESSAGES.NAME_TOO_SHORT.replace("{name}", flaggedName)) ||
			violationMessage.includes(RULE_MESSAGES.OBJECT_KEY_TOO_SHORT.replace("{name}", flaggedName))
		) {
			suggestedName = undefined;
		} else if (
			violationMessage.includes(RULE_MESSAGES.BOOLEAN_NO_PREFIX.replace("{name}", flaggedName)) ||
			violationMessage.includes(RULE_MESSAGES.OBJECT_KEY_BOOLEAN_NO_PREFIX.replace("{name}", flaggedName))
		) {
			suggestedName = undefined;
		} else if (
			violationMessage.includes(RULE_MESSAGES.BOOLEAN_NEGATIVE_PATTERN.replace("{name}", flaggedName)) ||
			violationMessage.includes(RULE_MESSAGES.OBJECT_KEY_BOOLEAN_NEGATIVE_PATTERN.replace("{name}", flaggedName))
		) {
			suggestedName = flaggedName
				.replace(/_not_([^_]+)/i, (_match, replacementText) => `_${replacementText}`)
				.replace(/not_([^_]+)/i, (_match, replacementText) => `${replacementText}`)
				.replace(/is_not_/i, "is_")
				.replace(/did_not_/i, "did_")
				.replace(/cannot_/i, "can_")
				.replace(/does_not_/i, "does_")
				.replace(/has_not_/i, "has_")
				.toLowerCase();
		} else if (
			violationMessage.includes(RULE_MESSAGES.FUNCTION_NO_ACTION_WORD.replace("{name}", flaggedName)) ||
			violationMessage.includes(RULE_MESSAGES.FUNCTION_TOO_SHORT.replace("{name}", flaggedName))
		) {
			const symbol = this.symbols.find(symbol => symbol.name === flaggedName && symbolFunctionTypeList.includes(symbol.type));
			const functionBody = symbol?.body;
			const result = await this.fetchSuggestedNameFromLLM({
				message: violationMessage,
				functionBody: functionBody,
				modelId: Models.GROQ, // GROQ is faster and can handle most name suggestion generation
				flaggedName,
				document,
				diagnostic,
				userToken,
			});
			suggestedName = result ? result.suggestedName : undefined;
		}

		if (!suggestedName) return;

		const title = `Rename '${flaggedName}' to '${suggestedName}'`;
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
			const parserFilePath = this.getParserFilePath();
	
			return new Promise((resolve, reject) => {
				const process = spawn("python3", [parserFilePath]);
				let output = "";
				let error = "";
	
				process.stdout.on("data", (data) => {
					output += data.toString();
				});
				process.stderr.on("data", (data) => {
					error += data.toString();
					console.log(`[PARSER] ${data}`); 
				});
	
				process.on("close", async (code) => {
					if (code !== 0) {
						const errorMessage = `Process exited with code ${code}, stderr: ${error}`;
						console.error(errorMessage);
						return reject(new Error(errorMessage));
					}
	
					try {
						const jsonLines = output
							.split("\n")
							.filter(
								(line) =>
									line.trim().startsWith("[") || line.trim().startsWith("{")
							);
						const jsonString = jsonLines.join("\n");
						const results = JSON.parse(jsonString);
						const symbols = results.symbols || [];
						const securityIssues = results.security_issues || [];
						const nPlusOneIssues = results.nplusone_issues || [];
						
						if (symbols.length === 0) return resolve(symbols);
	
						await this.validateAndCreateDiagnostics(
							symbols,
							diagnostics,
							changedLines,
							document,
							securityIssues,
							nPlusOneIssues,
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
			if (error instanceof SyntaxError) {
				console.warn("Syntax error detected. Skipping invalid sections and continuing...");
				this.handleError(error);
				return diagnostics;
			} else {
				this.handleError(error);
				return [];
			}
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
		document: TextDocument,
		securityIssues: any[],
		nPlusOneIssues: any[],
    ): Promise<void> {
        const cacheKey = this.generateCacheKey(document.getText(), document);
    
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
            console.log("Using cached result for Django diagnostics");
            diagnostics.push(...cachedResult.diagnostics);
            return;
        }

        const conventions = this.getConventions();
		this.symbols = symbols;

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
                const { line, start, end } = this.adjustColumnOffsets(symbol);
                const range = Range.create(
                    Position.create(line, start),
                    Position.create(line, end)
                );
                diagnostics.push(this.createDiagnostic(
                    range,
                    result.reason,
                    DiagnosticSeverity.Warning
                ));
            }

            this.handleComments(leading_comments, symbol, diagnostics);
            this.handleCeleryTask(symbol, conventions, diagnostics);

            this.processDjangoSecurityIssues(securityIssues, diagnostics);
            this.processNPlusOneIssues(nPlusOneIssues, diagnostics);
        
            this.setCachedResult(cacheKey, diagnostics);
        }
    }

	private getParserFilePath(): string {
		const parserFilePath = path.join(
            __dirname,
            "..",
            "..",
            `./${PYTHON_DIRECTORY}/django_parser.py`
        );
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
                        DiagnosticSeverity.Warning,
						REDUNDANT_COMMENT_VIOLATION_SOURCE_TYPE
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
		return { violates: false, reason: "" };
	}

	private validateClassName(name: string): {
		violates: boolean;
		reason: string;
	} {
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

	private adjustColumnOffsets(symbol: any): { line: number, start: number, end: number } {
		const line = symbol.line - 1;
		let start = symbol.col_offset;
		let end = symbol.end_col_offset || (start + symbol.name.length);
	
		if (symbol.type === "function" || symbol.type.startsWith("django_") && symbol.type.endsWith("_method")) {
			start += "def ".length;
            end = start + symbol.name.length;
		} else if (symbol.type === "class" || symbol.type.startsWith("django_")) {
			start += "class ".length;
			end = symbol.end_col_offset || (start + symbol.name.length);
		}
	
		start = Math.max(0, start);
		end = Math.max(start, end);
	
		return { line, start, end };
	}

	public async provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]> {
		const diagnostics = document.uri
			? this.getDiagnostic(document.uri, document.version)
			: [];

		if (!diagnostics) return [];

        const codeActions: CodeAction[] = [];
		for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("exceeds the maximum length of")) continue;

			if (diagnostic.code === NAMING_CONVENTION_VIOLATION_SOURCE_TYPE) {
				const fix = await this.generateFixForNamingConventionViolation(
					document,
					diagnostic,
					userToken
				);
				if (fix) {
					codeActions.push(fix);
				}
			} else if (diagnostic.code === DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE) {
                const actions = this.getNPlusOneDiagnosticActions(document, diagnostic);
                codeActions.push(...actions);
            }
		}

        const filteredActions = codeActions.filter(action => action !== undefined);
		return filteredActions;
	}

	protected getNPlusOneDiagnosticActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
		const actions: CodeAction[] = [];

		if (diagnostic.code === DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE) {
			const title = 'Report as false positive';
			const reportAction = CodeAction.create(
				title,
				{
					title: title,
					command: COMMANDS.REPORT_FALSE_POSITIVE,
					arguments: [document.uri, diagnostic]
				},
				CodeActionKind.QuickFix
			);
			reportAction.diagnostics = [diagnostic];
			reportAction.isPreferred = true;
			actions.push(reportAction);
		}

		return actions;
	}

    private processDjangoSecurityIssues(
        securityIssues: any[],
        diagnostics: Diagnostic[],
    ): void {
        for (const issue of securityIssues) {
            const range: Range = {
                start: { line: issue.line - 1, character: 0 },
                end: { line: issue.line - 1, character: Number.MAX_VALUE }
            };

            const severity = this.mapSeverity(issue.severity);

            const diagnostic: Diagnostic = {
                range,
                message: issue.message,
                severity: severity,
                source: SOURCE_NAME,
                code: DJANGO_SECURITY_VIOLATION_SOURCE_TYPE,
                codeDescription: {
                    href: issue.doc_link
                }
            };

            diagnostics.push(diagnostic);
        }
    }

    private processNPlusOneIssues(
        issues: Issue[],
        diagnostics: Diagnostic[],
        changedLines?: Set<number>
    ): void {
        const uniqueIssues = this.deduplicateIssues(issues);
        console.log(`Detected ${issues.length} N+1 issues, ${uniqueIssues.size} after deduplication`);

        for (const issue of uniqueIssues.values()) {
            if (!this.shouldShowIssue(issue.score)) continue;

            const issueLine = issue.line - 1;
            
            if (changedLines && changedLines.has(issueLine)) {
                console.log(`Skipping N+1 issue at line ${issueLine} due to change`);
                continue;
            }

            const range: Range = {
                start: { line: issueLine, character: issue.col_offset || 0 },
                end: { line: issueLine, character: issue.end_col_offset || Number.MAX_VALUE },
            };

            const severity = this.mapSeverity(issue.severity);
            const diagnosticMessage = this.createStructuredDiagnosticMessage(issue, severity);
            
            const diagnostic: Diagnostic = {
                range,
                message: diagnosticMessage,
                severity: severity,
                source: SOURCE_NAME,
                code: DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE,
                codeDescription: {
                    href: 'https://docs.djangoproject.com/en/stable/topics/db/optimization/',
                },
                data: {
                    id: issue.id,
                    score: issue.score,
                    contextualInfo: issue.contextual_info,
                },
            };

            diagnostics.push(diagnostic);
        }

        console.log(`Processed ${uniqueIssues.size} unique N+1 issues`);
    }

    private deduplicateIssues(issues: Issue[]): Map<string, Issue> {
        const uniqueIssues = new Map<string, Issue>();

        for (const issue of issues) {
            const issueKey = this.generateIssueKey(issue);
            const existingIssue = uniqueIssues.get(issueKey);

            if (!existingIssue || this.shouldReplaceExistingIssue(existingIssue, issue)) {
                uniqueIssues.set(issueKey, issue);
            }
        }

        return uniqueIssues;
    }

    private generateIssueKey(issue: Issue): string {
        // Create a unique key based on the issue's properties
        return `${issue.line}-${issue.col_offset}-${issue.contextual_info?.query_type}-${issue.contextual_info?.is_in_loop}`;
    }

    /**
    *  Replace if the new issue has a higher score or more detailed information
    */
    private shouldReplaceExistingIssue(existing: Issue, newIssue: Issue): boolean {
        if (newIssue.score > existing.score) return true;
        if (newIssue.score === existing.score && newIssue.message.length > existing.message.length) return true;
        return false;
    }

    private createStructuredDiagnosticMessage(issue: Issue, severity: DiagnosticSeverity): string {
        const severityIndicator = this.getSeverityIndicator(severity);
        const contextInfo = this.generateContextInfo(issue);
        
        return `${severityIndicator} N+1 Query Detected (Score: ${issue.score})
        \n[Issue]\n${issue.message}
        \n[Context]\n${contextInfo}\n`;
    }

    private generateContextInfo(issue: Issue): string {
        if (!issue.contextual_info) return 'Potential inefficient database query';

        const { query_type, related_field, is_in_loop, loop_start_line, is_bulk_operation } = issue.contextual_info;
        const fieldDescription = related_field || 'a queryset';
        let contextInfo = '';

        switch (query_type) {
            case 'attribute_access':
                contextInfo = `Detected while accessing the related field "${fieldDescription}"`;
                break;
            case 'write':
                contextInfo = `Detected while performing a write operation on ${fieldDescription}`;
                break;
            case 'read':
                contextInfo = `Detected while performing a read operation (e.g., filter(), get()) on ${fieldDescription}`;
                break;
            default:
                contextInfo = `Detected using .${query_type}() on ${fieldDescription}`;
        }

        if (is_in_loop) {
            contextInfo += ` in a loop (starts at line ${loop_start_line})`;
        }

        if (is_bulk_operation) {
            contextInfo += ` (Bulk operation detected)`;
        }

        return contextInfo;
    }
    
    private sendRateLimitNotification(): void {
        this.connection.sendNotification(RATE_LIMIT_NOTIFICATION_ID, {
            message: "Daily limit for N+1 query detection has been reached. Your quota for this feature will reset tomorrow."
        });
    }
    
    private sendForbiddenNotification(): void {
        this.connection.sendNotification(ACCESS_FORBIDDEN_NOTIFICATION_ID, {
            message: "You do not have permission to use the N+1 query detection feature. Please check your authentication."
        });
    }

    private generateCacheKey(documentText: string, document: TextDocument): string {
        const normalizedText = documentText || "";
        const functionBodyHash = createHash('md5').update(normalizedText).digest('hex');
        return `${document.uri}:${functionBodyHash}`;
    }
    
    private getCachedResult(key: string): CachedResult | null {
        const cached = this.nPlusOnecache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached;
        }
        return null;
    }    

    private setCachedResult(key: string, diagnostics: Diagnostic[]): void {
        this.nPlusOnecache.set(key, { diagnostics, timestamp: Date.now() });
    }      

    clearNPlusOneCache(): void {
        this.nPlusOnecache.clear();
        console.log('N+1 query detection cache cleared due to severity threshold change');
    }

    public updateConfiguration(newSettings: ExtensionSettings): void {
        const oldThreshold = this.settings.general.nPlusOneMinimumSeverityThreshold;
        this.settings = newSettings;
    
        if (oldThreshold !== newSettings.general.nPlusOneMinimumSeverityThreshold) {
            this.clearNPlusOneCache();
        }
    }

    private mapSeverity(severity: Severity): DiagnosticSeverity {
        switch (severity) {
            case Severity.ERROR:
                return DiagnosticSeverity.Error;
            case Severity.WARNING:
                return DiagnosticSeverity.Warning;
            case Severity.INFORMATION:
                return DiagnosticSeverity.Information;
            case Severity.HINT:
                return DiagnosticSeverity.Hint;
            default:
                return DiagnosticSeverity.Warning;
        }
    }

    private shouldShowIssue(score: number): boolean {
        const minScore = this.getMinScoreForSeverity(this.settings.general.nPlusOneMinimumSeverityThreshold);
        return score >= minScore;
    }

    private getMinScoreForSeverity(severity: Severity): number {
        switch (severity) {
            case Severity.ERROR:
                return 90;
            case Severity.WARNING:
                return 60;
            case Severity.INFORMATION:
                return 30;
            case Severity.HINT:
            default:
                return 0;
        }
    }

    private getSeverityIndicator(severity: DiagnosticSeverity): string {
        switch (severity) {
            case DiagnosticSeverity.Error:
                return '🛑';
            case DiagnosticSeverity.Warning:
                return '🔶';
            case DiagnosticSeverity.Information:
                return 'ℹ️';
            case DiagnosticSeverity.Hint:
                return '💡';
            default:
                return '•';
        }
    }

	public logFalsePositiveFeedback(diagnosticId: string): void {
		LOGGER.info(`False positive reported`, {
			userId: cachedUserToken,
			diagnosticId: diagnosticId,
			timestamp: new Date().toISOString()
		});
	}
}