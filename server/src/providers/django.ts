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
			this.createNPlusOneDiagnostics(llmResult, symbol, diagnostics, document);
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

    private createNPlusOneDiagnostics(llmResult: LLMNPlusOneResult, symbol: any, diagnostics: Diagnostic[], document: TextDocument): void {
        const symbolStartOffset = document.offsetAt({ line: symbol.line - 1, character: 0 });
        const symbolEndOffset = document.offsetAt({ line: symbol.function_end_line, character: 0 });
        const symbolText = document.getText({ start: document.positionAt(symbolStartOffset), end: document.positionAt(symbolEndOffset) });

        let issueIndex = 0;
        let searchStartIndex = 0;

        while (issueIndex < llmResult.issues.length) {
            const issue = llmResult.issues[issueIndex];
            const problematicCode = issue.problematic_code.trim();

            const relativeIndex = symbolText.indexOf(problematicCode, searchStartIndex);
			const notFound = -1;

            if (relativeIndex === notFound) {
                issueIndex++;
                searchStartIndex = 0;
                continue;
            }

            const absoluteStartOffset = symbolStartOffset + relativeIndex;
            const absoluteEndOffset = absoluteStartOffset + problematicCode.length;

            const range: Range = {
                start: document.positionAt(absoluteStartOffset),
                end: document.positionAt(absoluteEndOffset)
            };

            const diagnosticMessage = this.formatIssueDiagnosticMessage(issue, issueIndex + 1);
            const diagnostic: Diagnostic = this.createDiagnostic(
				range,
				diagnosticMessage,
				DiagnosticSeverity.Warning,
				DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE
			);

            diagnostics.push(diagnostic);
            searchStartIndex = relativeIndex + problematicCode.length;
        }
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
}