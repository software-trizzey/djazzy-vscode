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
import { LLMNPlusOneResult } from '../llm/types';

type PossibleIssue = { 
    id: string; 
    startLine: number; 
    endLine: number; 
    message: string;
};

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

export class DjangoProvider extends PythonProvider {

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
                await this.detectNPlusOneQuery(symbol, diagnostics);
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

    private async detectNPlusOneQuery(symbol: any, diagnostics: Diagnostic[]): Promise<void> {
        if (!cachedUserToken) {
            LOGGER.warn("Only authenticated users can use the N+1 query detection feature.");
            return;
        }
    
        this.logUsageStatistics(symbol);
    
        const functionBody = symbol.body;
        const lines = functionBody.split('\n');
        let isInLoop = false;
        let loopStartLine = 0;
        let hasSelectRelated = false;
        let hasPrefetchRelated = false;
        const potentialIssues: Array<PossibleIssue> = [];
    
        const functionStartLine = symbol.function_start_line - 1;
    
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index].trim();
    
            if (line.includes('.select_related(')) {
                hasSelectRelated = true;
            }
            if (line.includes('.prefetch_related(')) {
                hasPrefetchRelated = true;
            }
    
            if (line.startsWith('for ') || line.startsWith('while ')) {
                isInLoop = true;
                loopStartLine = index;
            }
    
            for (const pattern of RELATED_FIELD_PATTERNS) {
                if (pattern.test(line)) {
                    if (isInLoop && !hasSelectRelated && !hasPrefetchRelated) {
                        potentialIssues.push({
                            id: uuidv4(),
                            startLine: functionStartLine + loopStartLine,
                            endLine: functionStartLine + index,
                            message: `Related field access inside a loop without select_related or prefetch_related`
                        });
                    }
                }
            }
    
            if (line === '' || line.startsWith('}')) {
                isInLoop = false;
                hasSelectRelated = false;
                hasPrefetchRelated = false;
            }
        }
    
        if (potentialIssues.length > 0) {
            try {
                const llmResult = await this.validateNPlusOneWithLLM(symbol, potentialIssues);
                
                if (llmResult.has_n_plus_one_issues) {
                    for (const issue of llmResult.issues) {
                        const startLine = issue.start_line ?? functionStartLine;
                        const endLine = issue.end_line ?? (functionStartLine + lines.length - 1);
    
                        this.addNPlusOneDiagnostic(
                            symbol,
                            diagnostics,
                            startLine,
                            endLine,
                            issue.description,
                            issue.suggestion
                        );
                    }
                }
    
                this.logDetectionResults(llmResult.issues.length);
            } catch (error) {
                this.logError(error as Error, 'N+1 detection');
            }
        }
    }

    private addNPlusOneDiagnostic(symbol: any, diagnostics: Diagnostic[], startLine: number, endLine: number, description: string, suggestion: string): void {
        const functionBodyLines = symbol.body.split('\n');
        const functionStartLine = symbol.function_start_line - 1;
        const functionEndLine = symbol.function_end_line - 1;
    
        const safeStartLine = Math.max(functionStartLine, Math.min(startLine, functionEndLine));
        const safeEndLine = Math.max(safeStartLine, Math.min(endLine, functionEndLine));
    
        const range: Range = {
            start: { 
                line: safeStartLine,
                character: safeStartLine === functionStartLine ? symbol.function_start_col : 0
            },
            end: { 
                line: safeEndLine,
                character: safeEndLine === functionEndLine ? symbol.function_end_col : functionBodyLines[safeEndLine - functionStartLine].length
            }
        };    
    
        const diagnosticMessage = `Potential N+1 query detected in function "${symbol.name}":\n${description}\n\nSuggestion: ${suggestion}`;
    
        const diagnostic: Diagnostic = {
            range,
            message: diagnosticMessage,
            severity: DiagnosticSeverity.Warning,
            source: SOURCE_NAME,
            code: DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE,
            codeDescription: {
                href: 'https://docs.djangoproject.com/en/stable/topics/db/optimization/'
            },
            data: { id: uuidv4() } // Track diagnostic instances
        };
        diagnostics.push(diagnostic);
    }

    private async validateNPlusOneWithLLM(symbol: any, potentialIssues: Array<PossibleIssue>): Promise<LLMNPlusOneResult> {
        if (!cachedUserToken) {
            LOGGER.warn("Only authenticated users can use the N+1 query detection feature.");
            return {
                has_n_plus_one_issues: false,
                issues: []
            };
        }
    
        const systemMessage = `You are an expert Django developer. Your task is to analyze the following Python code for potential N+1 query issues. 
        Confirm if the identified issues are valid N+1 problems. If they are valid, suggest optimizations. If they are false positives, explain why. 
        For each issue you confirm, include the 'issue_id' in your response.`;
    
        const developerInput = `
        Function name: ${symbol.name}
        Function body:
        ${symbol.body}
    
        Potential N+1 issues:
        ${potentialIssues.map(issue => `- Issue ID: ${issue.id}, Lines ${issue.startLine}-${issue.endLine}: ${issue.message}`).join('\n')}
        `;
    
        try {
            const llmResult = await chatWithLLM(systemMessage, developerInput, cachedUserToken);
            
            const processedResult: LLMNPlusOneResult = {
                has_n_plus_one_issues: llmResult.has_n_plus_one_issues,
                issues: llmResult.issues.map(issue => {
                    const matchingPotentialIssue = potentialIssues.find(
                        potentialIssue => potentialIssue.id === issue.issue_id
                    );
                    return {
                        ...issue,
                        start_line: matchingPotentialIssue?.startLine,
                        end_line: matchingPotentialIssue?.endLine
                    };
                })
            };
            
            return processedResult;
        } catch (error) {
            this.logError(error as Error, 'LLM validation');
            throw error;
        }
    }

	formatDiagnosticMessage(symbol: any, llmResult: any): string {
		return `N+1 QUERY ISSUES DETECTED IN: ${symbol.name}\n\nTotal Issues Found: ${llmResult.issues.length}\n\nHover over underlined code for details.`;
	}

	logUsageStatistics(symbol: any): void {
		LOGGER.info(`N+1 detection run for function: ${symbol.name}`, {
			userId: cachedUserToken,
			functionName: symbol.name,
			functionType: symbol.type,
			fileType: this.languageId,
			timestamp: new Date().toISOString()
		});
	}
	
	logPerformanceMetrics(startTime: number, endTime: number, linesOfCode: number): void {
		const duration = endTime - startTime;
		LOGGER.info(`N+1 detection performance`, {
			userId: cachedUserToken,
			duration: duration,
			linesOfCode: linesOfCode,
			linesPerSecond: linesOfCode / (duration / 1000)
		});
	}

	logDetectionResults(issues: number): void {
		LOGGER.info(`N+1 detection results`, {
			userId: cachedUserToken,
			issuesDetected: issues,
			timestamp: new Date().toISOString()
		});
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
}