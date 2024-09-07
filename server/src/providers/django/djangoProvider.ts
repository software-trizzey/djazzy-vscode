import { spawn } from 'child_process';
import path from 'path';

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

import {
	SOURCE_NAME,
	DJANGO_SECURITY_VIOLATION_SOURCE_TYPE,
	NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
	REDUNDANT_COMMENT_VIOLATION_SOURCE_TYPE,
    DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE
} from "../../constants/diagnostics";
import { ExtensionSettings, cachedUserToken, defaultConventions, pythonExecutable } from "../../settings";
import LOGGER from '../../common/logs';
import {
    ACCESS_FORBIDDEN_NOTIFICATION_ID,
    FIX_NAME,
    RATE_LIMIT_NOTIFICATION_ID,
    NPLUSONE_FEEDBACK 
} from '../../constants/commands';
import { Models, Severity, SymbolFunctionTypes } from '../../llm/types';

import { RULE_MESSAGES, RuleCodes } from '../../constants/rules';
import { LanguageConventions, CeleryTaskDecoratorSettings } from '../../languageConventions';
import { debounce, getChangedLinesFromClient, validatePythonFunctionName } from '../../utils';
import { LanguageProvider } from '../languageProvider';
import { DjangoProjectDetector, ModelCache } from './djangoProjectDetector';
import { API_SERVER_URL } from '../../constants/api';


const symbolFunctionTypeList = Object.values(SymbolFunctionTypes);

export class DjangoProvider extends LanguageProvider {

    provideDiagnosticsDebounced: (document: TextDocument) => void;

	private symbols: any[] = [];
	private codeActionsMessageCache: Map<string, CodeAction> = new Map();
    private isDjangoProject: boolean = false;
    private modelCache: ModelCache = new Map();
    private djangoProjectDetectionPromise: Promise<boolean>;


    constructor(
        languageId: keyof typeof defaultConventions.languages,
        connection: Connection,
        settings: ExtensionSettings,
        document: TextDocument
    ) {
        super(languageId, connection, settings, document);

        this.djangoProjectDetectionPromise = this.detectDjangoProjectAndModels(document);

        const timeoutInMilliseconds = 1000;
		this.provideDiagnosticsDebounced = debounce(
			(document) => this.provideDiagnostics(document),
			timeoutInMilliseconds
		);
    }

    public getConventions(): LanguageConventions {
        return defaultConventions.languages.python;
    }

    public setConventions(conventions: LanguageConventions): void {
		this.conventions = conventions;
	}

	public getStoredSettings(): ExtensionSettings {
		return this.settings;
	}

	public updateSettings(settings: ExtensionSettings): void {
		this.settings = settings;
		this.updateConventions(settings);
	}

    private async detectDjangoProjectAndModels(document: TextDocument): Promise<boolean> {
        const documentUri = document.uri;

        this.isDjangoProject = await DjangoProjectDetector.analyzeProject(documentUri, this.connection);
        
        if (this.isDjangoProject) {
            this.modelCache = DjangoProjectDetector.getAllModels();
            console.log(`Django project detected. Found ${this.modelCache.size} models.`);
        } else {
            console.log("Not a Django project");
        }
        
        return this.isDjangoProject;
    }

    public async provideDiagnostics(
		document: TextDocument,
        isOnSave: boolean = false
	): Promise<Diagnostic[]> {
		const conventions = this.getConventions();
		this.diagnosticsManager.deleteDiagnostic(document.uri);
		if (!conventions.isEnabled) return [];

		let diagnostics: Diagnostic[] = [];
		let changedLines: Set<number> | undefined = undefined;

		if (this.settings.general.onlyCheckNewCode) {
			changedLines = await getChangedLinesFromClient(
				this.connection,
				document.uri
			);
			if (changedLines && changedLines.size === 0) {
				return this.diagnosticsManager.getDiagnostic(document.uri, document.version) || [];
			}
		}

		diagnostics = await this.runDiagnostics(
			document,
			diagnostics,
			changedLines
		);

        const isDjangoProject = await this.djangoProjectDetectionPromise;
        if (isDjangoProject && isOnSave) {
            const nplusOneDiagnostics = await this.runNPlusOneQueryAnalysis(document);
            diagnostics = [...diagnostics, ...nplusOneDiagnostics];
        }

		this.diagnosticsManager.setDiagnostic(document.uri, document.version, diagnostics);
		return diagnostics;
	}

    async generateFixForNamingConventionViolation(
		document: TextDocument,
		diagnostic: Diagnostic,
		userToken: string
	): Promise<CodeAction | undefined> {
        const languageId = this.languageId;
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
			const result = await this.llmInteractionManager.fetchSuggestedNameFromLLM({
				message: violationMessage,
				functionBody: functionBody,
				modelId: Models.GROQ, // GROQ is faster and can handle most name suggestion generation
				flaggedName,
				document,
				diagnostic,
				userToken,
                languageId
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
            const isDjangProject = await this.djangoProjectDetectionPromise;
			const text = document.getText();
			const parserFilePath = this.getParserFilePath();
            const modelCacheObject = Object.fromEntries(this.modelCache);
            const modelCacheJson = JSON.stringify(modelCacheObject);
	
			return new Promise((resolve, reject) => {
				const process = spawn(pythonExecutable, [parserFilePath, modelCacheJson]);
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
						
						if (symbols.length === 0) return resolve(symbols);
	
						await this.validateAndCreateDiagnostics(
							symbols,
							diagnostics,
							changedLines,
							document,
							securityIssues,
                            isDjangProject
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
				this.errorHandler.handleError(error);
				return diagnostics;
			} else {
				this.errorHandler.handleError(error);
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
        isDjangoProject: boolean
    ): Promise<void> {
    
        const conventions = this.getConventions();
        this.symbols = symbols;
    
        for (const symbol of symbols) {
            this.processSymbol(symbol, diagnostics, changedLines, conventions);
        }
    
        if (isDjangoProject) {
            this.processDjangoSecurityIssues(securityIssues, diagnostics);
        }
    }    

    private async processSymbol(
        symbol: any,
        diagnostics: Diagnostic[],
        changedLines: Set<number> | undefined,
        conventions: LanguageConventions
    ): Promise<void> {
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
            return; // Skip validation for reserved symbols
        }
    
        if (changedLines && !changedLines.has(line)) {
            return; // Skip validation if line not in changedLines
        }
    
        let result: { violates: boolean; reason: string, diagnostics?: any[] } | undefined;

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
                    this.validateFunctionArguments(symbol, diagnostics);
                }
                break;
    
            case "assignment":
            case "variable":
                result = this.nameValidator.validateVariableName({
                    variableName: name,
                    variableValue: value,
                });
                break;
    
            case "class":
                result = this.nameValidator.validateClassName(name);
                break;
    
            case "dictionary":
                result = this.validateDictionary(symbol);
                if (result.violates && result.diagnostics) {
                    diagnostics.push(...result.diagnostics);
                }
                return; // Skip the general diagnostic creation for dictionaries
    
            case "list":
                result = this.nameValidator.validateListName(value);
                break;
    
            case "for_loop":
                this.handleForLoopTargets(symbol, diagnostics);
                return; // Skip the general diagnostic creation for for loops
    
            case "django_model":
                // TODO: Implement model name validation
                break;
    
            case "django_model_field":
            case "django_serializer_field":
                result = this.nameValidator.validateVariableName({
                    variableName: name,
                    variableValue: this.extractDjangoFieldValue(value),
                });

                if (result && result.violates) {
                    this.addDiagnostic(diagnostics, symbol, result.reason);
                }

                this.checkDjangoFieldConventions(symbol, diagnostics);
                break;
            case "django_class_view":
            case "django_func_view":
            case "django_class_view_method":
                if (
                    symbol.message && 
                    (
                        symbol.issue_code === RuleCodes.COMPLEX_VIEW ||
                        symbol.issue_code === RuleCodes.NO_EXCEPTION_HANDLER
                    )
                ) {
                    const mappedSeverity = this.mapSeverity(symbol.severity);
                    this.addDiagnostic(
                        diagnostics,
                        symbol,
                        symbol.message,
                        mappedSeverity,
                        symbol.issue_code
                    );
                }
                break;
        }
    
        if (result && result.violates) {
            this.addDiagnostic(diagnostics, symbol, result.reason);
        }
    
        this.handleComments(leading_comments, symbol, diagnostics);
        this.handleCeleryTask(symbol, conventions, diagnostics);
    }
    
    private validateFunctionArguments(symbol: any, diagnostics: Diagnostic[]): void {
        for (const arg of symbol.arguments) {
            const argumentResult = this.nameValidator.validateVariableName({
                variableName: arg.name,
                variableValue: arg.default,
            });
            if (argumentResult.violates) {
                const argRange = Range.create(
                    Position.create(arg.line - 1, arg.col_offset),
                    Position.create(arg.line - 1, arg.col_offset + arg.name.length)
                );
                const functionArgDiagnostic = this.diagnosticsManager.createDiagnostic(
                    argRange,
                    argumentResult.reason,
                    DiagnosticSeverity.Warning
                );
                diagnostics.push(functionArgDiagnostic);
            }
        }
    }

	private getParserFilePath(filename: string = 'django_parser.py'): string {
        const basePath = process.env.PYTHON_TOOLS_PATH || path.resolve(
            __dirname, '..', 'bundled', 'tools', 'python'
        );
        const parserFilePath = path.join(basePath, filename);

        console.log(`Resolved parser file path: ${parserFilePath}`);
    
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
                const result = this.nameValidator.validateVariableName({
                    variableName: variableName,
                    variableValue: null,
                });
                if (result.violates) {
                    const range = Range.create(
                        Position.create(line, col_offset),
                        Position.create(line, col_offset + variableName.length)
                    );
                    const loopDiagnostic = this.diagnosticsManager.createDiagnostic(
                        range, result.reason, DiagnosticSeverity.Warning
                    );
                    diagnostics.push(loopDiagnostic);
                }
            }
        }
    }

    private handleComments(comments: any[], symbol: any, diagnostics: Diagnostic[]): void {
        if (this.settings.comments.flagRedundant && comments) {
            for (const comment of comments) {
                const result = this.commentAnalyzer.isCommentRedundant(comment.value, symbol);
                if (result.violates) {
                    const range = Range.create(
                        Position.create(comment.line, comment.col_offset),
                        Position.create(comment.line, comment.end_col_offset)
                    );
                    const commentDiagnostic = this.diagnosticsManager.createDiagnostic(
                        range,
                        result.reason,
                        DiagnosticSeverity.Warning,
						REDUNDANT_COMMENT_VIOLATION_SOURCE_TYPE
                    );
                    diagnostics.push(commentDiagnostic);
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
                const celeryDiagnostic = this.diagnosticsManager.createDiagnostic(
                    range, violation, DiagnosticSeverity.Warning
                );
                diagnostics.push(celeryDiagnostic);
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
			
			const validationResult = this.nameValidator.validateObjectPropertyName({
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
	
		if (
            symbol.type === "function" || symbol.type === "django_func_view" || symbol.type.startsWith("django_") && symbol.type.endsWith("_method")) {
			start += "def ".length;
            end = start + symbol.name.length;
		} else if (symbol.type === "class" || symbol.type === "django_class_view") {
			start += "class ".length;
			end = start + symbol.name.length;
		} else if (/(ForeignKey|TextField|CharField)/.test(symbol.value) && symbol?.full_line_length) {
            end = symbol.full_line_length;
        }

        if (
            symbol.issue_code === RuleCodes.NO_EXCEPTION_HANDLER && (
                symbol.type === "django_func_view" || symbol.type === "django_class_view_method"
            )
         ) {
            start = symbol.col_offset;  
            end = symbol.full_line_length || (start + symbol.name.length);
        }
	
		start = Math.max(0, start);
		end = Math.max(start, end);
	
		return { line, start, end };
	}

    public async provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]> {
        const diagnostics = document.uri
            ? this.diagnosticsManager.getDiagnostic(document.uri, document.version)
            : [];
    
        if (!diagnostics) return [];
    
        const codeActions: CodeAction[] = [];
        
        for (const diagnostic of diagnostics) {
            if (diagnostic.code === RuleCodes.NPLUSONE) {
                const feedbackAction = CodeAction.create(
                    `Provide feedback: ${diagnostic.message}`,
                    Command.create(
                        'Provide feedback',
                        NPLUSONE_FEEDBACK,
                        document.uri,
                        diagnostic
                    ),
                    CodeActionKind.QuickFix
                );
                feedbackAction.diagnostics = [diagnostic];
                feedbackAction.isPreferred = true;
    
                codeActions.push(feedbackAction);
            }
        }
    
        const filteredActions = codeActions.filter(action => action !== undefined);
        return filteredActions;
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

    private async sendNPlusOneRequestToApi(parsedData: any, documentUri: string): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];
        const connectionInfo = {
            user_api_key: cachedUserToken,
            server_url: `${API_SERVER_URL}/chat/nplusone/`,
        };
    
        const payload = {
            functionCode: parsedData.functionCode,
            modelDefinitions: parsedData.modelDefinitions,
            querysetDefinitions: parsedData.querysetDefinitions,
            loopDefinitions: parsedData.loopDefinitions,
            optimizationMethods: "", // Any optimization methods
            apiKey: connectionInfo.user_api_key
        };
    
        const response = await fetch(connectionInfo.server_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${connectionInfo.user_api_key}`
            },
            body: JSON.stringify(payload)
        });
    
        if (response.ok) {
            const analysisResults = await response.json();
            if (analysisResults && analysisResults.n_plus_one_detected && analysisResults.results) {
                LOGGER.info(`[User] ${cachedUserToken} N+1 query analysis results: ${JSON.stringify(analysisResults.results)}`);
    
                for (const result of analysisResults.results) {
                    const range = Range.create(
                        Position.create(result.location.start.line - 1, result.location.start.column - 1),
                        Position.create(result.location.end.line - 1, result.location.end.column - 1)
                    );
    
                    const formattedMessage = this.diagnosticsManager.formatNPlusOneDiagnosticMessage(result);
    
                    const diagnostic: Diagnostic = {
                        range,
                        message: formattedMessage,
                        severity: DiagnosticSeverity.Warning,
                        source: SOURCE_NAME,
                        code: RuleCodes.NPLUSONE,
                        relatedInformation: []
                    };
    
                    diagnostics.push(diagnostic);
                }
            }
        } else {
            const errorMessage = await response.text();
            LOGGER.error(`N+1 API request failed with status ${response.status}: ${errorMessage}`);
            throw new Error(`N+1 API request failed with status ${response.status}: ${errorMessage}`);
        }
    
        return diagnostics;
    }    

    private async runNPlusOneQueryAnalysis(document: TextDocument): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = [];
        const modelCacheObject = Object.fromEntries(this.modelCache);
        const modelCacheJson = JSON.stringify(modelCacheObject);
        const documentText = document.getText();
    
        return new Promise((resolve, reject) => {
            const nplusoneServicePath = this.getParserFilePath('detect_nplusone.py');
            const process = spawn(pythonExecutable, [nplusoneServicePath, documentText, modelCacheJson]);
    
            let output = '';
            let error = '';
    
            process.stdout.on('data', (data) => {
                output += data.toString();
            });
    
            process.stderr.on('data', (data) => {
                error += data.toString();
                console.log(`[N+1 DETECT] ${error}`);
            });
    
            process.on('close', (code) => {
                if (code !== 0) {
                    LOGGER.error(`N+1 query analysis process exited with code ${code}: ${error}`);
                    console.error(error);
                    return reject(new Error(`N+1 query analysis process failed: ${error}`));
                }
    
                try {
                    const parsedData = JSON.parse(output);
                    LOGGER.info(`[User] ${cachedUserToken} parsed N+1 query data: ${JSON.stringify(parsedData)}`);
                    this.sendNPlusOneRequestToApi(parsedData, document.uri)
                        .then((apiDiagnostics) => {
                            resolve(apiDiagnostics);
                        })
                        .catch((apiError) => {
                            LOGGER.error(`N+1 query analysis API error: ${apiError}`);
                            reject(apiError);
                        });
    
                } catch (error: any) {
                    LOGGER.error(`Error parsing N+1 query analysis output: ${error}`);
                    reject(new Error(`Failed to parse N+1 query analysis output: ${error.message}`));
                }
            });
        });
    }
        
    private checkDjangoFieldConventions(symbol: any, diagnostics: Diagnostic[]): void {
        let djangoModelAndSerializerFieldMessage: string | undefined;
    
        if (symbol.type === "django_model_field") {
            if (symbol.has_set_foreign_key_related_name === false) {
                djangoModelAndSerializerFieldMessage = `ForeignKey '${symbol.name}' is missing 'related_name'. It is recommended to always define 'related_name' for better reverse access.`;
            } else if (symbol.has_set_foreign_key_on_delete === false) {
                djangoModelAndSerializerFieldMessage = `ForeignKey '${symbol.name}' is missing 'on_delete'. It is strongly recommended to always define 'on_delete' for better data integrity.`;
            } else if (symbol.is_charfield_or_textfield_nullable === true) {
                djangoModelAndSerializerFieldMessage = `CharField/TextField '${symbol.name}' uses null=True. Use blank=True instead to avoid NULL values. Django stores empty strings for text fields, keeping queries and validation simpler.`;
            }
        }
    
        if (djangoModelAndSerializerFieldMessage) {
            const severity = this.determineModelFieldSeverity(symbol);
            this.addDiagnostic(
                diagnostics,
                symbol,
                djangoModelAndSerializerFieldMessage,
                severity,
                DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE
            );
        }
    }

    private addDiagnostic(
        diagnostics: Diagnostic[],
        symbol: any,
        message: string,
        severity: DiagnosticSeverity = DiagnosticSeverity.Warning,
        sourceType: string = NAMING_CONVENTION_VIOLATION_SOURCE_TYPE
    ): void {
        const { line, start, end } = this.adjustColumnOffsets(symbol);
        const range = Range.create(
            Position.create(line, start),
            Position.create(line, end)
        );
    
        const diagnostic = this.diagnosticsManager.createDiagnostic(range, message, severity, sourceType);
        diagnostics.push(diagnostic);
    }

    private determineModelFieldSeverity(symbol: any): DiagnosticSeverity {
        // TODO: this should be configurable via settings
        if (symbol.has_set_foreign_key_on_delete === false) {
            return DiagnosticSeverity.Warning;
        } else if (symbol.has_set_foreign_key_related_name === false) {
            return DiagnosticSeverity.Information;
        }
        return DiagnosticSeverity.Information;
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
                return DiagnosticSeverity.Hint;
        }
    }

    private getMinScoreForSeverity(severity: Severity): number {
        switch (severity) {
            case Severity.ERROR:
                return 95;
            case Severity.WARNING:
                return 71;
            case Severity.INFORMATION:
                return 41;
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
                return '💡';
        }
    }

	public logFalsePositiveFeedback(diagnosticId: string): void {
		LOGGER.info(`False positive reported`, {
			userId: "anonymous",
			diagnosticId: diagnosticId,
			timestamp: new Date().toISOString()
		});
	}
}