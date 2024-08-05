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
import { createHash } from 'crypto';

import { PythonProvider } from "./python";
import { SOURCE_NAME, DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { ExtensionSettings, cachedUserToken, defaultConventions } from "../settings";
import LOGGER from '../common/logs';
import COMMANDS, { ACCESS_FORBIDDEN_NOTIFICATION_ID, RATE_LIMIT_NOTIFICATION_ID } from '../constants/commands';
import { chatWithLLM } from '../llm/chat';
import { DeveloperInput, LLMNPlusOneResult, Models, Issue, Severity } from '../llm/types';
import { RateLimitError, ForbiddenError } from '../llm/helpers';

const IS_FALSE_POSITIVE = 'FALSE POSITIVE';

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

    private trackQuerysetOperations(functionBody: string): Set<string> {
        const operations = new Set<string>();
        const prefetchRegex = /\.prefetch_related\(['"](\w+)(?:__\w+)*['"]\)/g;
        const selectRegex = /\.select_related\(['"](\w+)(?:__\w+)*['"]\)/g;
        
        let match;
        while ((match = prefetchRegex.exec(functionBody)) !== null) {
            operations.add(`prefetch:${match[1]}`);
        }
        while ((match = selectRegex.exec(functionBody)) !== null) {
            operations.add(`select:${match[1]}`);
        }
        
        return operations;
    }

    private async detectNPlusOneQuery(symbol: any, diagnostics: Diagnostic[], document: TextDocument): Promise<void> {
        if (!cachedUserToken) {
            LOGGER.warn("Only authenticated users can use the N+1 query detection feature.");
            return;
        }
    
        const functionBodyWithLines = symbol.body_with_lines;
        const potentialIssues = this.analyzeFunctionForPotentialIssues(functionBodyWithLines, symbol);
    
        this.clearDiagnosticsForSymbol(symbol, diagnostics);

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
                    
                    if (llmResult.isRateLimited) {
                        this.sendRateLimitNotification();
                        return;
                    }
                    
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

    private isFalsePositive(line: string, operations: Set<string>): boolean {
        const relatedField = this.extractRelatedField(line);
        if (relatedField && (operations.has(`prefetch:${relatedField}`) || operations.has(`select:${relatedField}`))) {
            return true;
        }

        if (line.includes('.exists()') || line.includes('.count()')) {
            return true;
        }

        if (line.match(/\.(id|pk)$/)) {
            return true;
        }

        if (line.match(/\.filter\([\w_]+__in=/)) {
            return true;
        }

        return false;
    }

    private extractRelatedField(line: string): string | null {
        const match = line.match(/(\w+)\.(all\(\)|filter\(|get\()/);
        return match ? match[1] : null;
    }

    private analyzeFunctionForPotentialIssues(functionBodyWithLines: any[], symbol: any): Issue[] {
        const potentialIssues: Issue[] = [];
        const operations = this.trackQuerysetOperations(symbol.body);
        
        let isInLoop = false;
        let loopStartLine = 0;

        for (const lineInfo of functionBodyWithLines) {
            const line = lineInfo.content.trim();
            const absoluteLineNumber = lineInfo.absolute_line_number;
            const relativeLineNumber = absoluteLineNumber - symbol.function_start_line + 1;

            if (line.startsWith('for ') || line.startsWith('while ')) {
                isInLoop = true;
                loopStartLine = relativeLineNumber;
            }

            if ((line.includes('.all()') || line.includes('.filter(') || line.includes('.get(')) && !this.isFalsePositive(line, operations)) {
                const relatedField = this.extractRelatedField(line);
                potentialIssues.push({
                    id: uuidv4(),
                    startLine: relativeLineNumber,
                    endLine: relativeLineNumber,
                    startCol: lineInfo.start_col,
                    endCol: lineInfo.end_col,
                    problematicCode: line,
                    message: `Potential N+1 query detected: '${line.trim()}'`,
                    contextualInfo: {
                        isInLoop: isInLoop,
                        loopStartLine: isInLoop ? loopStartLine : undefined,
                        relatedField: relatedField,
                        queryType: this.getQueryType(line),
                    },
                    suggestedFix: this.generateSuggestedFix(line, relatedField, operations, isInLoop),
                    severity: isInLoop ? Severity.WARNING : Severity.INFORMATION,
                    score: isInLoop ? 75 : 50,
                });
            }

            if (line === '' || line.endsWith('}')) {
                isInLoop = false;
            }
        }

        return potentialIssues;
    }

    private getQueryType(line: string): string {
        if (line.includes('.all()')) return 'all';
        if (line.includes('.filter(')) return 'filter';
        if (line.includes('.get(')) return 'get';
        return 'unknown';
    }

    private generateSuggestedFix(line: string, relatedField: string | null, operations: Set<string>, isInLoop: boolean): string {
        if (!relatedField) {
            return "Consider optimizing this query to avoid potential N+1 issues.";
        }

        if (isInLoop) {
            if (!operations.has(`prefetch:${relatedField}`)) {
                return `Consider using .prefetch_related('${relatedField}') on the queryset before the loop.`;
            } else {
                return `Ensure that you're using the prefetched '${relatedField}' correctly inside the loop.`;
            }
        } else {
            return `Consider using .select_related('${relatedField}') if this is a foreign key or one-to-one relationship.`;
        }
    }

    private addNPlusOneDiagnostics(symbol: any, diagnostics: Diagnostic[], issues: Issue[]): void {
        const functionStartLine = symbol.function_start_line;
    
        for (const issue of issues) {
            if (!this.shouldShowIssue(issue.score)) {
                console.log("Skipping issue with score", issue.score);
                continue;
            }
    
            const startLine = (issue.startLine ?? 1) + functionStartLine - 1;
            const endLine = (issue.endLine ?? 1) + functionStartLine - 1;
            const startCol = issue.startCol ?? 0;
            const endCol = issue.endCol ?? Number.MAX_VALUE;
    
            const range: Range = {
                start: { line: startLine - 1, character: startCol },
                end: { line: endLine - 1, character: endCol }
            };
    
            const severity = this.mapSeverity(issue.severity.toUpperCase() as Severity);
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
                data: { 
                    id: issue.id, 
                    score: issue.score,
                    contextualInfo: issue.contextualInfo
                }
            };
            diagnostics.push(diagnostic);
        }
    }

    private async validateNPlusOneWithLLM(symbol: any, potentialIssues: Issue[]): Promise<LLMNPlusOneResult> {
        if (!cachedUserToken) {
            LOGGER.warn("Only authenticated users can use the N+1 query detection feature.");
            return {
                has_n_plus_one_issues: false,
                issues: [],
                isRateLimited: false,
                isForbidden: true
            };
        }
    
        const developerInput: DeveloperInput = {
            functionName: symbol.name,
            functionBody: symbol.body,
            potentialIssues: potentialIssues
        };
    
        try {
            const llmResult = await chatWithLLM(
                "Analyze the provided input for N+1 queries.",
                developerInput,
                cachedUserToken,
                Models.OPEN_AI
            );    
            llmResult.issues = llmResult.issues.filter(issue => this.shouldShowIssue(issue.score));
            llmResult.has_n_plus_one_issues = llmResult.issues.length > 0;        

            for (let issue of llmResult.issues) {
                const matchedPotentialIssue = potentialIssues.find(potentialIssue => potentialIssue.id === issue.id);
                if (matchedPotentialIssue) {
                    issue = { ...issue, contextualInfo: matchedPotentialIssue.contextualInfo };
                }
            }

            return llmResult;
        } catch (error) {
            if (error instanceof RateLimitError) {
                LOGGER.warn(`Usage limit exceeded for user ${cachedUserToken}`);
                this.sendRateLimitNotification();
                return {
                    has_n_plus_one_issues: false,
                    issues: [],
                    isRateLimited: true
                };
            } else if (error instanceof ForbiddenError) {
                LOGGER.error(`Forbidden error for user ${cachedUserToken}`);
                this.sendForbiddenNotification();
                return {
                    has_n_plus_one_issues: false,
                    issues: [],
                    isForbidden: true
                };
            }
            this.logError(error as Error, 'LLM validation');
            throw error;
        }
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

    private generateCacheKey(symbol: any, document: TextDocument): string {
        const functionBodyHash = createHash('md5').update(symbol.body).digest('hex');
        return `${document.uri}:${symbol.name}:${functionBodyHash}`;
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
                return 70;
            case Severity.INFORMATION:
                return 50;
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

	private logError(error: Error, context: string): void {
		LOGGER.error(`Error in N+1 detection: ${context}`, {
			userId: cachedUserToken,
			errorMessage: error.message,
			errorStack: error.stack,
			timestamp: new Date().toISOString()
		});
	}

    private createStructuredDiagnosticMessage(issue: Issue, severity: DiagnosticSeverity): string {
        const severityIndicator = this.getSeverityIndicator(severity);
        let contextInfo = '';
        
        if (issue.contextualInfo) {
            contextInfo = `Detected in ${issue.contextualInfo.isInLoop ? 'a loop' : 'code'} ` +
                          `using .${issue.contextualInfo.queryType}() ` +
                          `on ${issue.contextualInfo.relatedField || 'a queryset'}`;
            if (issue.contextualInfo.isInLoop) {
                contextInfo += ` (loop starts at line ${issue.contextualInfo.loopStartLine})`;
            }
        }
        
        return `${severityIndicator} N+1 Query Detected (Score: ${issue.score})
        \n[Code]\n${issue.problematicCode}
        \n[Issue]\n${issue.message}
        \n[Context]\n${contextInfo || 'Potential inefficient database query'}
        \n[Suggestion]\n${issue.suggestedFix}\n`;
    }

    private clearDiagnosticsForSymbol(symbol: any, diagnostics: Diagnostic[]): void {
        const symbolRange = {
            start: { line: symbol.function_start_line - 1, character: 0 },
            end: { line: symbol.function_end_line - 1, character: Number.MAX_VALUE }
        };
        
        for (let lastIndex = diagnostics.length - 1; lastIndex >= 0; lastIndex--) {
            if (this.isRangeWithin(diagnostics[lastIndex].range, symbolRange)) {
                diagnostics.splice(lastIndex, 1);
            }
        }
    }

    private isRangeWithin(inner: Range, outer: Range): boolean {
        return (inner.start.line >= outer.start.line && inner.end.line <= outer.end.line);
    }
}