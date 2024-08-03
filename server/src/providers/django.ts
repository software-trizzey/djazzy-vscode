import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
    Connection,
	CodeAction,
	CodeActionKind,
} from "vscode-languageserver/node";
import { TextDocument } from 'vscode-languageserver-textdocument';

import { v4 as uuidv4 } from 'uuid';

import { PythonProvider } from "./python";
import { SOURCE_NAME, DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { ExtensionSettings, cachedUserToken, defaultConventions } from "../settings";
import LOGGER from '../common/logs';
import COMMANDS from '../constants/commands';
import { chatWithLLM } from '../llm/helpers';
import { DeveloperInput, LLMNPlusOneResult, Models, PossibleIssue } from '../llm/types';


const METHOD_NAMES = [
	"function",
	"django_model_method",
	"django_serializer_method",
	"django_view_method",
	"django_testcase_method",
];

const QUERY_METHODS = [
    "all",
    "filter",
    "get",
    "count",
    "exists",
    "aggregate",
    "annotate",
    "values",
    "values_list",
    "first",
    "last",
];

const REVERSE_FOREIGN_KEY_PATTERN = /\.[\w]+_set\./;
const FOREIGN_KEY_OR_ONE_TO_ONE_PATTERN = /\.[\w]+\./;

const RELATED_FIELD_PATTERNS = [
    REVERSE_FOREIGN_KEY_PATTERN,
    FOREIGN_KEY_OR_ONE_TO_ONE_PATTERN
];

const AGGREGATE_METHODS = [
    "Count",
    "Sum",
    "Avg",
    "Max",
    "Min",
];

interface CachedResult {
    result: LLMNPlusOneResult;
    timestamp: number;
}

const FIVE_MINUTES = 5 * 60 * 1000;

export class DjangoProvider extends PythonProvider {

    private nPlusOnecache: Map<string, CachedResult> = new Map();
    private cacheTTL: number = FIVE_MINUTES;

    constructor(
        languageId: keyof typeof defaultConventions.languages,
        connection: Connection,
        settings: ExtensionSettings
    ) {
        super(languageId, connection, settings);
    }

    async validateAndCreateDiagnostics(
        symbols: any[],
        diagnostics: Diagnostic[],
        changedLines: Set<number> | undefined,
		document: TextDocument
    ): Promise<void> {
        await super.validateAndCreateDiagnostics(symbols, diagnostics, changedLines, document);

		const highPrioritySymbols = symbols.filter(symbol => symbol.high_priority);
		console.log(`Found ${highPrioritySymbols.length} highPrioritySymbols for review`);

		for (const symbol of highPrioritySymbols) {
            if (METHOD_NAMES.includes(symbol.type)) {
                await this.detectNPlusOneQuery(symbol, diagnostics, document);
            }
        }
	}

	public async provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]> {
		const diagnostics = document.uri
			? this.getDiagnostic(document.uri, document.version)
			: [];
		if (!diagnostics) return [];

		return diagnostics.flatMap(diagnostic => {
			if (diagnostic.code === DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE) {
				return this.getNPlusOneDiagnosticActions(document, diagnostic);
			}
			return [];
		});
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

    private async detectNPlusOneQuery(symbol: any, diagnostics: Diagnostic[], document: TextDocument): Promise<void> {
        if (!cachedUserToken) {
            LOGGER.warn("Only authenticated users can use the N+1 query detection feature.");
            return;
        }

        const functionBodyWithLines = symbol.body_with_lines;
        const potentialIssues = this.analyzeFunctionForPotentialIssues(functionBodyWithLines, symbol);

        if (potentialIssues.length > 0) {
            try {
                const cacheKey = this.generateCacheKey(symbol, document);
                const cachedResult = this.getCachedResult(cacheKey);

                let llmResult: LLMNPlusOneResult;
                if (cachedResult) {
                    llmResult = cachedResult;
                    console.log(`Using cached result for ${cacheKey}`);
                } else {
                    llmResult = await this.validateNPlusOneWithLLM(symbol, potentialIssues);
                    this.setCachedResult(cacheKey, llmResult);
                }

                if (llmResult.has_n_plus_one_issues) {
                    this.addNPlusOneDiagnostics(symbol, diagnostics, llmResult.issues);
                }
            } catch (error) {
                this.logError(error as Error, 'N+1 detection');
            }
        }
    }

    private analyzeFunctionForPotentialIssues(bodyWithLines: any[], symbol: any): PossibleIssue[] {
        const potentialIssues: PossibleIssue[] = [];
        let isInLoop = false;
        let loopStartLine = 0;
        let hasSelectRelated = false;
        let hasPrefetchRelated = false;
    
        const functionStartLine = symbol.function_start_line;
    
        for (const lineInfo of bodyWithLines) {
            const line = lineInfo.content.trim();
            const absoluteLineNumber = lineInfo.absolute_line_number;
            const relativeLineNumber = absoluteLineNumber - functionStartLine + 1;
    
            if (line.includes('.select_related(')) {
                hasSelectRelated = true;
            }
            if (line.includes('.prefetch_related(')) {
                hasPrefetchRelated = true;
            }
    
            if (line.startsWith('for ') || line.startsWith('while ')) {
                isInLoop = true;
                loopStartLine = relativeLineNumber;
            }
    
            for (const pattern of RELATED_FIELD_PATTERNS) {
                if (pattern.test(line)) {
                    if (isInLoop && !hasSelectRelated && !hasPrefetchRelated) {
                        potentialIssues.push({
                            id: uuidv4(),
                            startLine: loopStartLine,
                            endLine: relativeLineNumber,
                            startCol: bodyWithLines.find(currentLine => currentLine.absolute_line_number === (loopStartLine + functionStartLine - 1)).start_col,
                            endCol: lineInfo.end_col,
                            message: `Related field access inside a loop without select_related or prefetch_related`
                        });
                    }
                }
            }
    
            for (const method of QUERY_METHODS) {
                if (line.includes(`.${method}(`)) {
                    if (isInLoop) {
                        potentialIssues.push({
                            id: uuidv4(),
                            startLine: relativeLineNumber,
                            endLine: relativeLineNumber,
                            startCol: lineInfo.start_col,
                            endCol: lineInfo.end_col,
                            message: `Database query method '${method}' used inside a loop`
                        });
                    }
                }
            }
    
            for (const method of AGGREGATE_METHODS) {
                if (line.includes(method)) {
                    potentialIssues.push({
                        id: uuidv4(),
                        startLine: relativeLineNumber,
                        endLine: relativeLineNumber,
                        startCol: lineInfo.start_col,
                        endCol: lineInfo.end_col,
                        message: `Potential inefficient use of '${method}' aggregate method`
                    });
                }
            }
    
            if (line === '' || line.startsWith('}')) {
                isInLoop = false;
                hasSelectRelated = false;
                hasPrefetchRelated = false;
            }
        }
    
        return potentialIssues;
    }

    private addNPlusOneDiagnostics(symbol: any, diagnostics: Diagnostic[], issues: any[]): void {
        const functionStartLine = symbol.function_start_line;
    
        for (const issue of issues) {
            const startLine = (issue.start_line ?? 1) + functionStartLine - 1;
            const endLine = (issue.end_line ?? 1) + functionStartLine - 1;
            const startCol = issue.start_col ?? 0;
            const endCol = issue.end_col ?? Number.MAX_VALUE;
    
            const range: Range = {
                start: { line: startLine - 1, character: startCol },
                end: { line: endLine - 1, character: endCol }
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
                    href: 'https://docs.djangoproject.com/en/stable/topics/db/optimization/'
                },
                data: { id: issue.issue_id, score: issue.score }
            };
            diagnostics.push(diagnostic);
        }
    }

    private mapSeverity(severity: string): DiagnosticSeverity {
        switch (severity) {
            case 'Error':
                return DiagnosticSeverity.Error;
            case 'Warning':
                return DiagnosticSeverity.Warning;
            case 'Information':
                return DiagnosticSeverity.Information;
            case 'Hint':
                return DiagnosticSeverity.Hint;
            default:
                return DiagnosticSeverity.Warning;
        }
    }

    private async validateNPlusOneWithLLM(symbol: any, potentialIssues: PossibleIssue[]): Promise<LLMNPlusOneResult> {
        if (!cachedUserToken) {
            LOGGER.warn("Only authenticated users can use the N+1 query detection feature.");
            return {
                has_n_plus_one_issues: false,
                issues: []
            };
        }
    
        const developerInput: DeveloperInput = {
            functionName: symbol.name,
            functionBody: symbol.body,
            potentialIssues: potentialIssues.map(issue => ({
                id: issue.id,
                startLine: issue.startLine,
                endLine: issue.endLine,
                startCol: issue.startCol,
                endCol: issue.endCol,
                message: issue.message
            }))
        };
    
        try {
            const llmResult = await chatWithLLM(
                "Analyze the provided input for N+1 queries.",
                developerInput,
                cachedUserToken,
                Models.OPEN_AI
            );
            const processedResult: LLMNPlusOneResult = {
                has_n_plus_one_issues: llmResult.has_n_plus_one_issues,
                issues: llmResult.issues.map(issue => ({
                    issue_id: issue.issue_id,
                    description: issue.description,
                    problematic_code: issue.problematic_code,
                    suggestion: issue.suggestion,
                    start_line: issue.start_line,
                    end_line: issue.end_line,
                    start_col: issue.start_col,
                    end_col: issue.end_col,
                    score: issue.score,
                    severity: issue.severity
                }))
            };
            
            return processedResult;
        } catch (error) {
            this.logError(error as Error, 'LLM validation');
            throw error;
        }
    }

    private generateCacheKey(symbol: any, document: TextDocument): string {
        return `${document.uri}:${symbol.name}:${symbol.body}`;
    }

    private getCachedResult(key: string): LLMNPlusOneResult | null {
        const cached = this.nPlusOnecache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.result;
        }
        return null;
    }

    private setCachedResult(key: string, result: LLMNPlusOneResult): void {
        this.nPlusOnecache.set(key, { result, timestamp: Date.now() });
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

	private logError(error: Error, context: string): void {
		LOGGER.error(`Error in N+1 detection: ${context}`, {
			userId: cachedUserToken,
			errorMessage: error.message,
			errorStack: error.stack,
			timestamp: new Date().toISOString()
		});
	}

    private createStructuredDiagnosticMessage(issue: any, severity: DiagnosticSeverity): string {
        const severityIndicator = this.getSeverityIndicator(severity);
        
        return `${severityIndicator} N+1 Query Detected (Score: ${issue.score})
        \n[Code]\n${issue.problematic_code.trim()}
        \n[Issue]\n${issue.description.trim()}
        \n[Suggestion]\n${issue.suggestion.trim()}\n`;
    }
}