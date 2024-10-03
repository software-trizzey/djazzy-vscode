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
	NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
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
import { LanguageConventions } from '../../languageConventions';
import { debounce, getChangedLinesFromClient } from '../../utils';
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
    public djangoProjectDetectionPromise: Promise<boolean>;


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
			violationMessage.includes(RULE_MESSAGES.FUNCTION_NAME_NO_VERB.replace("{name}", flaggedName)) ||
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
				const process = spawn(pythonExecutable, [parserFilePath, document.uri, modelCacheJson]);
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
                        const parsedDiagnostics = results.diagnostics || [];
						
						if (parsedDiagnostics.length === 0) return resolve(parsedDiagnostics);

                        parsedDiagnostics.forEach((diagnostic: any) => {
                            const mappedSeverity = this.mapSeverity(diagnostic.severity);
                            this.addDiagnostic(
                                diagnostics,
                                diagnostic,
                                diagnostic.message,
                                mappedSeverity,
                                diagnostic.issue_code
                            );
                        });
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

	private getParserFilePath(filename: string = 'run_check.py'): string {
        const basePath = process.env.PYTHON_TOOLS_PATH || path.resolve(
            __dirname, '..', 'bundled', 'tools', 'python'
        );
        const parserFilePath = path.join(basePath, filename);

        console.log(`Resolved parser file path: ${parserFilePath}`);
    
        return parserFilePath;
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
            optimizationMethods: "", // TODO: Any optimization methods
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
                LOGGER.info(`[User] ${cachedUserToken} N+1 query analysis found ${analysisResults.results.length} issues.`);
    
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

    public async runNPlusOneQueryAnalysis(document: TextDocument): Promise<Diagnostic[]> {
        const fileName = path.basename(document.uri);
        const dirName = path.dirname(document.uri);

        if (
            !this.isDjangoProject || 
            fileName === 'settings.py' || 
            fileName === 'admin.py' ||
            dirName.includes('tests') ||
            dirName.includes('static') ||
            dirName.includes('templates') ||
            fileName === 'urls.py'
        ) {
            console.log(`Skipping N+1 query analysis for unlikely query file: "${fileName}"`);
            return [];
        }

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
                    LOGGER.info(`[User] ${cachedUserToken} N+1 parsing complete.`);
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

	public logFalsePositiveFeedback(diagnosticId: string): void {
		LOGGER.info(`False positive reported`, {
			userId: "anonymous",
			diagnosticId: diagnosticId,
			timestamp: new Date().toISOString()
		});
	}  
}