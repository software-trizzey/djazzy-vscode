import { Connection, Diagnostic, Position, Range as LspRange, } from 'vscode-languageserver/node';
import { TextDocument, Range } from 'vscode-languageserver-textdocument';

import { ContextType, DeveloperInput, FunctionContext, Models, VariableContext } from '../../llm/types';
import { RATE_LIMIT_NOTIFICATION_ID, ACCESS_FORBIDDEN_NOTIFICATION_ID } from '../../constants/commands';
import LOGGER from '../../common/logs';
import { chatWithLLM } from '../../llm/chat';
import { LanguageConventions } from '../../languageConventions';


export interface NameSuggestionContext {
    flaggedName: string;
    message: string;
    modelId: Models;
    document: TextDocument;
    diagnostic: Diagnostic;
    userToken: string;
    languageId: string;
    functionBody?: string;
}

export interface LLMSuggestionResponse {
    originalName: string;
    suggestedName: string;
    justification: string;
}


export class LLMInteractionManager {
    private connection: Connection;
    private conventions: LanguageConventions;

    constructor(connection: Connection, conventions: LanguageConventions) {
        this.connection = connection;
        this.conventions = conventions;
    }

    public getConventions() {
        return this.conventions;
    }

	public async fetchSuggestedNameFromLLM({
		flaggedName,
		message,
		document,
		diagnostic,
		userToken,
		functionBody,
		modelId,
        languageId
	}: NameSuggestionContext): Promise<LLMSuggestionResponse | null> {
        let context: VariableContext | FunctionContext;
        if (functionBody) {
            context = this.generateFunctionContext(languageId, document, diagnostic, flaggedName, functionBody);
        } else {
            context = this.generateVariableContext(languageId, document, diagnostic, flaggedName);
        }
		
		try {
			context.violationReason = message;
			const developerInput: DeveloperInput = {
				functionName: flaggedName,
				functionBody: functionBody || "",
				context: context,
				isRenameSuggestion: true,
			};
			const response = await chatWithLLM(
				"Suggest a name for the provided symbol based on the context.",
				developerInput,
				userToken,
				modelId
			);
			const formattedResponse = {
				originalName: response.originalName || flaggedName,
				suggestedName: response.suggestedName || "",
				justification: response.justification || "",
			};
			return formattedResponse;
		} catch (error: any) {
			if (error.error?.type === "invalid_request_error") {
				LOGGER.error("InvalidRequestError:", error.error);
			} else {
				LOGGER.error("Error fetching suggested name from LLM:", error);
			}
			return null;
		}
	}

    protected extractFunctionBody(document: TextDocument, range: Range): string {
		const functionBody = document.getText(range);
		return functionBody;
	}

	protected limitFunctionBodySize(
		functionBody: string,
		maxLength: number = 1000
	): string {
		if (functionBody.length <= maxLength) {
			return functionBody;
		}
		return functionBody.substring(0, maxLength);
	}

	protected getFunctionBodyRange(
		document: TextDocument,
		functionRange: Range
	): Range {
		const startLine = functionRange.start.line;
		let endLine = startLine + 1;

		while (endLine < document.lineCount) {
			const line = document.getText({
				start: { line: endLine, character: 0 },
				end: { line: endLine, character: Number.MAX_SAFE_INTEGER },
			});

			if (line.trim() === "") {
				break;
			}

			endLine++;
		}

		return LspRange.create(
			Position.create(startLine, functionRange.start.character),
			Position.create(endLine, 0)
		);
	}

	/**
	 * Get the surrounding code of the given range.
	 */
	getSurroundingCode(document: TextDocument, range: Range): string {
        const startLine = Math.max(range.start.line - 3, 0);
        const endLine = Math.min(range.end.line + 3, document.lineCount - 1);
        const surroundingCode = document.getText(LspRange.create(startLine, 0, endLine, 0));
        return surroundingCode;
    }

	protected generateVariableContext(
        languageId: string,
        document: TextDocument,
        diagnostic: Diagnostic,
        variableName: string
    ): VariableContext {
		const usage = this.getSurroundingCode(document, diagnostic.range);
		const { expressiveNames: { variables } } = this.getConventions();
		
		return {
			name: variableName,
			type: ContextType.variable,
			usage,
			surroundingCode: usage,
			examples: variables.examples,
			languageId
		};
	}
	
	protected generateFunctionContext(
        languageId: string,
        document: TextDocument,
        diagnostic: Diagnostic,
        functionName: string,
        functionBody: string
    ): FunctionContext {
		const surroundingCode = this.getSurroundingCode(document, diagnostic.range);
		const { expressiveNames: { functions } } = this.getConventions();
		
		return {
			name: functionName,
			type: ContextType.function,
			usage: functionBody,
			surroundingCode,
			examples: functions.examples,
			languageId
		};
	}

    public sendRateLimitNotification(): void {
        this.connection.sendNotification(RATE_LIMIT_NOTIFICATION_ID, {
            message: "Daily limit for N+1 query detection has been reached. Your quota for this feature will reset tomorrow."
        });
    }
    
    public sendForbiddenNotification(): void {
        this.connection.sendNotification(ACCESS_FORBIDDEN_NOTIFICATION_ID, {
            message: "You do not have permission to use the N+1 query detection feature. Please check your authentication."
        });
    }
}