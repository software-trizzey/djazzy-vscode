import { EOL } from 'os';

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
	Position,
    Connection,
} from "vscode-languageserver/node";

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

import { PythonProvider } from "./python";
import { SOURCE_NAME, DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { RULE_MESSAGES } from '../constants/rules';
import { djangoDetectNPlusOneQuery } from '../constants/chat';
import { ExtensionSettings, cachedUserToken, defaultConventions } from "../settings";
import { chatWithGroq } from '../llm/groq';
import { chatWithOpenAI } from '../llm/openai';
import { LLMNPlusOneResult } from '../llm/types';
import LOGGER from '../common/logs';

const METHOD_NAMES = [
	"functiondef",
	"django_model_method",
	"django_serializer_method",
	"django_view_method",
	"django_testcase_method",
];

const MAX_NUMBER_OF_CACHED_ITEMS = 100;
const CACHE_DURATION_1_HOUR = 1000 * 60 * 60;


export class DjangoProvider extends PythonProvider {

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
        changedLines: Set<number> | undefined
    ): Promise<void> {
        await super.validateAndCreateDiagnostics(symbols, diagnostics, changedLines);

		for (const symbol of symbols) {
            if (METHOD_NAMES.includes(symbol.type)) {
                await this.detectNPlusOneQuery(symbol, diagnostics);
            }
        }
	}

	private async detectNPlusOneQuery(symbol: any, diagnostics: Diagnostic[]): Promise<void> {
		if (!cachedUserToken) {
			LOGGER.error("User must be authenticated to use the N+1 query detection feature. Skipping...");
			return;
		}
		const functionBody = symbol.body;
		const sanitizedFunctionBody = this.sanitizeFunctionBody(functionBody);
		const cacheKey = this.generateCacheKey(symbol, functionBody);
		let llmResult = this.nplusoneCache.get(cacheKey);
	
		if (!llmResult) {
			const response = await chatWithGroq(
				"Analyze Django code for N+1 query inefficiencies",
				sanitizedFunctionBody,
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
			this.createNPlusOneDiagnostics(llmResult, symbol, diagnostics);
		} else {
			this.removeDiagnosticsForSymbol(symbol, diagnostics);
		}
	}
	
	private removeDiagnosticsForSymbol(symbol: any, diagnostics: Diagnostic[]): void {
		const start = symbol.line;
		const end = symbol.function_end_line - 1;
		const index = diagnostics.findIndex(diagnostic => 
			diagnostic.range.start.line >= start && 
			diagnostic.range.end.line <= end &&
			diagnostic.source === SOURCE_NAME
		);
		if (index !== -1) {
			diagnostics.splice(index, 1);
		}
	}
		
	private createNPlusOneDiagnostics(llmResult: LLMNPlusOneResult, symbol: any, diagnostics: Diagnostic[]): void {
		const start = Position.create(symbol.line, symbol.col_offset);
		const end = Position.create(symbol.function_end_line - 1, symbol.end_col_offset);
		const range = Range.create(start, end);
	
		const diagnosticMessage = this.formatDiagnosticMessage(symbol, llmResult);
		const diagnostic: Diagnostic = Diagnostic.create(
			range,
			diagnosticMessage,
			DiagnosticSeverity.Warning,
			DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE,
			SOURCE_NAME
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
		const headerLine = '='.repeat(50);
		const subHeaderLine = '-'.repeat(40);
	
		let diagnosticMessage = `${headerLine}${EOL}`;
		diagnosticMessage += `N+1 QUERY ISSUES DETECTED IN: ${symbol.name}${EOL}`;
		diagnosticMessage += `${headerLine}${EOL}${EOL}`;
	
		llmResult.issues.forEach((issue: any, index: number) => {
			diagnosticMessage += `ISSUE ${index + 1}:${EOL}`;
			diagnosticMessage += `${subHeaderLine}${EOL}`;
			
			diagnosticMessage += `Description:${EOL}${issue.description}${EOL}${EOL}`;
			
			diagnosticMessage += `Problematic Code:${EOL}`;
			diagnosticMessage += `${issue.original_code_snippet.split(EOL).map((line: string) => '    ' + line).join(EOL)}${EOL}${EOL}`;
			
			diagnosticMessage += `Suggestion:${EOL}${issue.suggestion}${EOL}${EOL}`;
			
			diagnosticMessage += `Proposed Fix:${EOL}`;
			diagnosticMessage += `${issue.code_snippet_fix.split(EOL).map((line: string) => '    ' + line).join(EOL)}${EOL}${EOL}`;
		});
	
		diagnosticMessage += `${headerLine}${EOL}`;
		diagnosticMessage += `Total Issues Found: ${llmResult.issues.length}${EOL}`;
		diagnosticMessage += `${headerLine}${EOL}`;
	
		return diagnosticMessage;
	}
}