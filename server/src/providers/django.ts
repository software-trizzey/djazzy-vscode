import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
    Connection,
} from "vscode-languageserver/node";
import { TextDocument } from 'vscode-languageserver-textdocument';

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

import { PythonProvider } from "./python";
import { SOURCE_NAME, DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE, DJANGO_NPLUSONE_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { ExtensionSettings, cachedUserToken, defaultConventions } from "../settings";
import { LLMNPlusOneResult } from '../llm/types';
import LOGGER from '../common/logs';

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


const MAX_NUMBER_OF_CACHED_ITEMS = 100;
const CACHE_DURATION_1_HOUR = 1000 * 60 * 60;

export class DjangoProvider extends PythonProvider {

	private symbols: any = [];
	private nplusoneCache: LRUCache<string, LLMNPlusOneResult>;
	private cacheOptions = {
		max: MAX_NUMBER_OF_CACHED_ITEMS,
		ttl: CACHE_DURATION_1_HOUR,
	};

    constructor(
        languageId: keyof typeof defaultConventions.languages,
        connection: Connection,
        settings: ExtensionSettings
    ) {
        super(languageId, connection, settings);
		this.nplusoneCache = new LRUCache(this.cacheOptions);
    }

    async validateAndCreateDiagnostics(
        symbols: any[],
        diagnostics: Diagnostic[],
        changedLines: Set<number> | undefined,
		document: TextDocument
    ): Promise<void> {
        await super.validateAndCreateDiagnostics(symbols, diagnostics, changedLines, document);

		this.symbols = symbols;
		const highPrioritySymbols = symbols.filter(symbol => symbol.high_priority);
		console.log(`Found ${highPrioritySymbols.length} highPrioritySymbols for review`);

		for (const symbol of highPrioritySymbols) {
            if (METHOD_NAMES.includes(symbol.type)) {
                this.detectNPlusOneQuery(symbol, diagnostics);
            }
        }
	}

    private detectNPlusOneQuery(symbol: any, diagnostics: Diagnostic[]): void {
		if (!cachedUserToken) {
			LOGGER.warn("Only authenticated users can use the N+1 query detection feature.");
			return;
		}

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
            }
        };

        diagnostics.push(diagnostic);
    }

	private createNPlusOneDiagnostics(llmResult: LLMNPlusOneResult, diagnostics: Diagnostic[]): void {
		const processedIssues = new Set<string>();
		let issueIndex = 0;
	
		while (issueIndex < llmResult.issues.length) {
			const issue = llmResult.issues[issueIndex];
			if (!issue.problematic_code) {
				issueIndex++;
				continue;
			}
	
			const problematicCode = this.normalizeWhitespace(issue.problematic_code);
			if (processedIssues.has(problematicCode)) {
				issueIndex++;
				continue;
			}
	
			let innermostSymbol: any = null;
	
			this.symbols.forEach((symbol: any) => {
				if (symbol.type === "for_loop") {
					const forLoopBody = this.normalizeWhitespace(symbol.body);
					if (forLoopBody.includes(problematicCode)) {
						if (!innermostSymbol || this.isInnerLoop(symbol, innermostSymbol)) {
							innermostSymbol = symbol;
						}
					}
				}
			});
	
			if (innermostSymbol) {
				this.addDiagnosticForIssue(innermostSymbol, diagnostics, issue, issueIndex);
				processedIssues.add(problematicCode);
			}
	
			issueIndex++;
		}
	}	

	private addDiagnosticForIssue(symbol: any, diagnostics: Diagnostic[], issue: any, issueIndex: number): void {
		const startLine = symbol.line;
		const startCharacter = symbol.col_offset;
		const endLine = startLine + (symbol.body.match(/\n/g) || []).length;
		const endCharacter = symbol.end_col_offset;
	
		const range: Range = {
			start: { line: startLine, character: startCharacter },
			end: { line: endLine, character: endCharacter }
		};
	
		const diagnosticMessage = this.formatIssueDiagnosticMessage(issue, issueIndex + 1);
		const diagnostic: Diagnostic = this.createDiagnostic(
			range,
			diagnosticMessage,
			DiagnosticSeverity.Warning,
			DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE
		);
		diagnostics.push(diagnostic);
	}

	private hashFunctionBody(functionBody: string): string {
		return crypto.createHash('sha256').update(functionBody).digest('hex');
	}

	private generateCacheKey(symbol: any, functionBody: string): string {
		const bodyHash = this.hashFunctionBody(functionBody);
		return `${symbol.name}_${symbol.line}_${symbol.col_offset}_${symbol.function_end_line}_${symbol.end_col_offset}_${bodyHash}`;
	}
	
	public clearNPlusOneCache(): void {
		this.nplusoneCache.clear();
	}

	formatDiagnosticMessage(symbol: any, llmResult: any): string {
		return `N+1 QUERY ISSUES DETECTED IN: ${symbol.name}\n\nTotal Issues Found: ${llmResult.issues.length}\n\nHover over underlined code for details.`;
	}

	private formatIssueDiagnosticMessage(issue: any, issueNumber: number): string {
		return `N+1 Query Issue ${issueNumber}: ${issue.description}\n\nSuggestion: ${issue.suggestion}`;
	}

	private normalizeWhitespace(text: string): string {
		return text.replace(/\s+/g, ' ').trim();
	}

	private isInnerLoop(inner: any, outer: any): boolean {
		return inner.line > outer.line && inner.function_end_line < outer.function_end_line;
	}
}