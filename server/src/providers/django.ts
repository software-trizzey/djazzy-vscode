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
                this.detectNPlusOneQuery(symbol, diagnostics);
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

    private detectNPlusOneQuery(symbol: any, diagnostics: Diagnostic[]): void {
		if (!cachedUserToken) {
			LOGGER.warn("Only authenticated users can use the N+1 query detection feature.");
			return;
		}

		this.logUsageStatistics(symbol);

        const functionBody = symbol.body;
        const lines = functionBody.split('\n');
        let isInLoop = false;
        let loopStartLine = 0;
        let potentialIssues: Array<{line: number, issue: string}> = [];
		let hasSelectRelated = false;
        let hasPrefetchRelated = false;

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

            for (const method of QUERY_METHODS) {
                if (line.includes(`.${method}(`)) {
                    if (isInLoop) {
                        this.addNPlusOneDiagnostic(symbol, diagnostics, loopStartLine, index, `Query method '${method}' inside a loop`);
                    } else {
                        potentialIssues.push({line: index, issue: `Query method '${method}' potentially used in a loop context`});
                    }
                }
            }

            for (const pattern of RELATED_FIELD_PATTERNS) {
                if (pattern.test(line)) {
                    if (isInLoop && !hasSelectRelated && !hasPrefetchRelated) {
                        this.addNPlusOneDiagnostic(symbol, diagnostics, loopStartLine, index, `Related field access inside a loop without select_related or prefetch_related`);
                    }
                }
            }

			if (line.includes('.exists(')) {
                // Don't flag this as an issue, as it's often more efficient than count()
                continue;
            }

            for (const method of AGGREGATE_METHODS) {
                if (line.includes(`${method}(`)) {
                    if (isInLoop) {
                        this.addNPlusOneDiagnostic(symbol, diagnostics, loopStartLine, index, `Aggregation method '${method}' inside a loop`);
                    } else {
                        potentialIssues.push({line: index, issue: `Aggregation method '${method}' potentially used in a loop context`});
                    }
                }
            }

            if (line.includes('[') && line.includes('for') && line.includes('in')) {
                for (const method of QUERY_METHODS) {
                    if (line.includes(`.${method}(`)) {
                        this.addNPlusOneDiagnostic(symbol, diagnostics, index, index, `Query method '${method}' in a list comprehension`);
                    }
                }
            }

            if (line === '' || line.startsWith('}')) {
                isInLoop = false;
                if (potentialIssues.length > 1) {
                    for (const issue of potentialIssues) {
                        this.addNPlusOneDiagnostic(symbol, diagnostics, issue.line, issue.line, issue.issue);
                    }
                }
                potentialIssues = [];
            }
        }

		this.logDetectionResults(diagnostics.length);
    }

    private addNPlusOneDiagnostic(symbol: any, diagnostics: Diagnostic[], startLine: number, endLine: number, message: string): void {
        const range: Range = {
            start: { line: symbol.line + startLine, character: 0 },
            end: { line: symbol.line + endLine, character: Number.MAX_SAFE_INTEGER }
        };

        const diagnosticMessage = `Potential N+1 query detected in function "${symbol.name}":\n${message}. Consider optimizing the database queries.`;

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