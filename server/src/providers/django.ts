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
import { SOURCE_NAME, DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { ExtensionSettings, cachedUserToken, defaultConventions } from "../settings";
import { chatWithGroq } from '../llm/groq';
import { LLMNPlusOneResult } from '../llm/types';
import LOGGER from '../common/logs';

const METHOD_NAMES = [
	"function",
	"django_model_method",
	"django_serializer_method",
	"django_view_method",
	"django_testcase_method",
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

		for (const symbol of symbols) {
            if (METHOD_NAMES.includes(symbol.type)) {
                await this.detectNPlusOneQuery(symbol, diagnostics, document);
            }
        }
	}

	private async detectNPlusOneQuery(symbol: any, diagnostics: Diagnostic[], document: TextDocument): Promise<void> {
		if (!cachedUserToken) {
			LOGGER.error("User must be authenticated to use the N+1 query detection feature. Skipping...");
			return;
		}
		const functionBody = symbol.body;
		const cacheKey = this.generateCacheKey(symbol, functionBody);
		let llmResult = this.nplusoneCache.get(cacheKey);
	
		if (!llmResult) {
			const response = await chatWithGroq(
				"Analyze Django code for N+1 query inefficiencies",
				functionBody,
				cachedUserToken
			);
			try {
				llmResult = response as LLMNPlusOneResult;
				this.nplusoneCache.set(cacheKey, llmResult);
			} catch (error: any) {
				LOGGER.error("Error during NPlus Query analysis", error.message);
				return;
			}
		}
	
		if (llmResult.has_n_plus_one_issues) {
			console.log(`[USER ${cachedUserToken}] Found issues for ${symbol.name}`);
			this.createNPlusOneDiagnostics(llmResult, diagnostics);
		} else {
			this.removeDiagnosticsForSymbol(symbol, diagnostics);
		}
	}
	
    private removeDiagnosticsForSymbol(symbol: any, diagnostics: Diagnostic[]): void {
        const start = symbol.line;
        const end = symbol.function_end_line;
        diagnostics = diagnostics.filter(diagnostic => 
            !(diagnostic.range.start.line >= start && 
              diagnostic.range.end.line <= end &&
              diagnostic.source === SOURCE_NAME)
        );
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