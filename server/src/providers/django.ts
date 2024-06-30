import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
	Position,
    Connection,
} from "vscode-languageserver/node";

import { PythonProvider } from "./python";
import { SOURCE_NAME, DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
import { RULE_MESSAGES } from '../constants/rules';
import { djangoDetectNPlusOneQuery } from '../constants/chat';
import { ExtensionSettings, cachedUserToken, defaultConventions } from "../settings";
import { chatWithGroq } from '../llm/groq';
import { LLMNPlusOneResult } from '../llm/types';

const METHOD_NAMES = [
	"functiondef",
	"django_model_method",
	"django_serializer_method",
	"django_view_method",
	"django_testcase_method",
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
			console.error("User must be authenticated to use the N+1 query detection feature. Skipping...");
			return;
		}
		console.log("symbol: ", symbol);
		const functionBody = symbol.body;
		const sanitizedFunctionBody = this.sanitizeFunctionBody(functionBody);
		
		const message = djangoDetectNPlusOneQuery.replace("{DJANGO_CODE}", sanitizedFunctionBody);
		const response = await chatWithGroq("Analyze Django code for N+1 query inefficiencies", message, cachedUserToken);
		try {
			const llmResult = response as LLMNPlusOneResult;
			if (llmResult.has_n_plus_one_issues) {
				this.createNPlusOneDiagnostics(llmResult, symbol, diagnostics);
			}
		} catch (error) {
			console.error("Error during NPlus Query analysis", error);
		}
	}
		
	private createNPlusOneDiagnostics(llmResult: LLMNPlusOneResult, symbol: any, diagnostics: Diagnostic[]): void {
		const start = Position.create(symbol.line, symbol.col_offset);
		const end = Position.create(symbol.function_end_line - 1, symbol.end_col_offset);
		const range = Range.create(start, end);
	
		let diagnosticMessage = `Detected in N+1 queries in function "${symbol.name}".\n\n`;
	
		llmResult.issues.forEach((issue, index) => {
			diagnosticMessage += `Issue ${index + 1} - ${issue.description}\n`;
			diagnosticMessage += `Line: ${issue.original_code_snippet}\n`;
			diagnosticMessage += `Suggestion: ${issue.suggestion}\n`;
			diagnosticMessage += `Example: ${issue.code_snippet_fix}\n\n`;
		});
	
		const diagnostic: Diagnostic = Diagnostic.create(
			range,
			diagnosticMessage,
			DiagnosticSeverity.Warning,
			DJANGO_BEST_PRACTICES_VIOLATION_SOURCE_TYPE,
			SOURCE_NAME
		);
	
		diagnostics.push(diagnostic);
	}
}