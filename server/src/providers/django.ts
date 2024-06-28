import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
	Position,
    Connection,
} from "vscode-languageserver/node";

import { PythonProvider } from "./python";
import { SOURCE_NAME, NAMING_CONVENTION_VIOLATION_SOURCE_TYPE } from "../constants/diagnostics";
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
                this.detectNPlusOneQuery(symbol, diagnostics);
            }
        }
	}

    private async detectNPlusOneQuery(symbol: any, diagnostics: Diagnostic[]): Promise<void> {
		if (!cachedUserToken) {
			console.error("User must be authenticated to use the N+1 query detection feature. Skipping...");
			return;
		}
        const functionBody = symbol.body;
        const sanitizedFunctionBody = this.sanitizeFunctionBody(functionBody);

		const message = djangoDetectNPlusOneQuery.replace("{DJANGO_CODE}", sanitizedFunctionBody);
		const response = await chatWithGroq("detect N+1 queries", message, cachedUserToken);
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
		const lineOffset = symbol.function_start_line - 1;
	
		llmResult.issues.forEach(issue => {
			const startLine = lineOffset + issue.start_line - 1;
			const endLine = lineOffset + issue.end_line - 1;
			
			const start = Position.create(startLine, issue.start_character);
			const end = Position.create(endLine, issue.end_character);
			const range = Range.create(start, end);
		
	
			const diagnostic: Diagnostic = Diagnostic.create(
				range,
				`N+1 Query Issue: ${issue.description}\nSuggestion: ${issue.suggestion}`,
				DiagnosticSeverity.Warning,
				NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
				SOURCE_NAME
			);
	
			diagnostics.push(diagnostic);
		});
	
		const functionStart = Position.create(symbol.line, symbol.col_offset);
		const functionEnd = Position.create(symbol.function_end_line, symbol.end_col_offset || 0);
		const functionRange = Range.create(functionStart, functionEnd);	
	
		const generalDiagnostic: Diagnostic = Diagnostic.create(
			functionRange,
			`This function has N+1 query issues. Overall efficiency score: ${llmResult.overall_efficiency_score}/10\nGeneral recommendations: ${llmResult.general_recommendations.join(", ")}`,
			DiagnosticSeverity.Information,
			NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
			SOURCE_NAME
		);
	
		diagnostics.push(generalDiagnostic);
	}
}