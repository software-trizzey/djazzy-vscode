import {
	Connection,
	Diagnostic,
	CodeAction,
	CodeActionKind,
	Position,
	MessageType,
	ShowMessageRequestParams,
	Range as LspRange,
} from "vscode-languageserver/node";

import { TextDocument, Range } from "vscode-languageserver-textdocument";

import { chatWithGroq } from "../llm/groq";
import { chatWithOpenAI } from "../llm/openai";

import {
	isLikelyBoolean,
	hasNegativePattern,
	getChangedLinesFromClient,
} from "../utils";
import {
	ExtensionSettings,
	defaultConventions,
	settingsVersion,
} from "../settings";
import LOGGER from "../common/logs";

import type { LanguageConventions } from "../languageConventions";
import { RULE_MESSAGES } from '../constants/rules';
import { verbDictionary } from '../data';

const actionWordsValues = Object.values(verbDictionary);


export interface RenameSuggestion {
	suggestedName: string;
	justification: string;
}

interface ThemeSystemViolation {
	reason: string;
	violates: boolean;
	index: number;
	value: string;
}



export abstract class LanguageProvider {
	protected connection: Connection;
	protected cache: Map<string, any>;
	protected cancellationId: number = 0;
	protected conventions?: LanguageConventions;
	protected settings: ExtensionSettings;

	private systemMessage: string = '';

	protected diagnostics: Map<
		string,
		{
			diagnostics: Diagnostic[];
			documentVersion: number;
			settingsVersion: number;
		}
	> = new Map();

	constructor(
		protected languageId: keyof typeof defaultConventions.languages,
		connection: Connection,
		settings: ExtensionSettings
	) {

		this.connection = connection;
		this.cache = new Map<string, any>();

		this.settings = settings;

		const languageSettings = settings.languages[languageId];
		if (!languageSettings) {
			this.sendNotSupportedMessage(languageId);
			return;
		}
		this.conventions = languageSettings;

		this.systemMessage = `You are a code assistant tasked with correcting naming convention violations according to standard coding practices. The user will provide a variable or function name that violates their team's style conventions along with the function body for context.
		Your task is to suggest a more descriptive name that aligns with the project's naming conventions. Consider the following project-specific information:
		- Programming language: ${this.languageId}
		- Naming conventions: snake_case, camelCase, PascalCase, etc.
		- Existing code patterns: If a function body is provided, analyze it and any relevant surrounding code to understand the context and generate a suitable suggestion.
		
		Respond with a JSON object containing three keys:
		{
			"originalName": "string",
			"suggestedName": "string",
			"justification": "string"
		}
		Ensure the JSON object is well-formed and does not contain any extraneous characters.`;
	}

	protected getConventions(): LanguageConventions {
		if (!this.conventions) throw new Error("Language conventions are not set.");
		return this.conventions;
	}

	protected setConventions(conventions: LanguageConventions): void {
		this.conventions = conventions;
	}

	protected getStoredSettings(): ExtensionSettings {
		return this.settings;
	}

	public updateSettings(settings: ExtensionSettings): void {
		this.settings = settings;
		this.updateConventions(settings);
	}

	private updateConventions(settings: ExtensionSettings): void {
		const languageSettings = settings.languages[this.languageId];
		if (!languageSettings) {
			this.sendNotSupportedMessage(this.languageId);
			return;
		}
		this.conventions = languageSettings;
	}

	public async provideDiagnostics(
		document: TextDocument
	): Promise<Diagnostic[]> {
		const conventions = this.getConventions();
		this.deleteDiagnostic(document.uri);
		if (!conventions.isEnabled) return [];

		let diagnostics: Diagnostic[] = [];
		let changedLines: Set<number> | undefined = undefined;

		if (this.settings.general.onlyCheckNewCode) {
			changedLines = await getChangedLinesFromClient(
				this.connection,
				document.uri
			);
			if (changedLines && changedLines.size === 0) {
				// No changes, no need to process diagnostics
				return this.getDiagnostic(document.uri, document.version) || [];
			}
		}

		diagnostics = await this.runDiagnostics(
			document,
			diagnostics,
			changedLines
		);
		this.setDiagnostic(document.uri, document.version, diagnostics);
		return diagnostics;
	}

	protected abstract runDiagnostics(
		document: TextDocument,
		diagnostics: Diagnostic[],
		changedLines: Set<number> | undefined
	): Promise<Diagnostic[]>;

	abstract generateFixForNamingConventionViolation(
		document: TextDocument,
		diagnostic: Diagnostic,
		userToken: string
	): Promise<CodeAction | undefined>;

	public static readonly providedCodeActionKinds = [
		CodeActionKind.QuickFix,
		CodeActionKind.Refactor,
	];

	public async provideCodeActions(
		document: TextDocument,
		userToken: string
	): Promise<CodeAction[]> {
		const diagnostics = document.uri
			? this.getDiagnostic(document.uri, document.version)
			: [];
		if (!diagnostics) return [];
		const namingConventionDiagnostics = diagnostics.filter((diagnostic) => {
			if (diagnostic.code !== "namingConventionViolation") return false;

			// TODO: for MVP we don't generate fixes for the following violations
			if (!diagnostic.message.includes("exceeds the maximum length")) {
				return true;
			}
			return false;
		});
		const actionPromises = namingConventionDiagnostics
			.map((diagnostic) =>
				this.generateFixForNamingConventionViolation(document, diagnostic, userToken)
			)
			.filter((promise) => promise !== undefined) as Promise<CodeAction>[];
		return await Promise.all(actionPromises);
	}

	async generateNameSuggestions(
		document: TextDocument,
		diagnostic: Diagnostic,
		userToken: string,
		suggestionCount: number = 1
	): Promise<RenameSuggestion[]> {
		const flaggedName = document.getText(diagnostic.range);
		const violationMessage = diagnostic.message;
		const suggestions: RenameSuggestion[] = [];
		let currentCount = 0;

		while (currentCount < suggestionCount) {
			if (violationMessage.includes(RULE_MESSAGES.NAME_TOO_SHORT.replace("{name}", flaggedName))) {
				const response = await this.fetchSuggestedNameFromLLM({
					message: violationMessage,
					modelType: "groq",
					document,
					diagnostic,
					userToken
				});
				if (response) {
					const data = JSON.parse(response);
					suggestions.push(data);
				}
			} else if (violationMessage.includes(RULE_MESSAGES.BOOLEAN_NEGATIVE_PATTERN.replace("{name}", flaggedName))) {
				suggestions.push({
					suggestedName: flaggedName.replace(/not/i, ""),
					justification: "Remove negative pattern"
				});
			} else if (violationMessage.includes(RULE_MESSAGES.BOOLEAN_NO_PREFIX.replace("{name}", flaggedName))) {
				const capitalizedName = flaggedName.charAt(0).toUpperCase() + flaggedName.slice(1);
				suggestions.push({
					suggestedName: `is${capitalizedName}`,
					justification: "Add boolean prefix"
				});
			} else if (violationMessage.includes(RULE_MESSAGES.FUNCTION_NO_ACTION_WORD.replace("{name}", flaggedName)) ||
				violationMessage.includes(RULE_MESSAGES.FUNCTION_TOO_SHORT.replace("{name}", flaggedName))) {
					if (this.settings.general.isDevMode) {
					suggestions.push({
						suggestedName: `get${flaggedName}`,
						justification: "Add verb prefix for function name"
					});
					} else {
						const functionBodyRange = this.getFunctionBodyRange(document, diagnostic.range);
						const functionBody = this.extractFunctionBody(document, functionBodyRange);
						const limitedFunctionBody = this.limitFunctionBodySize(functionBody);
						const response = await this.fetchSuggestedNameFromLLM({
							message: violationMessage,
							functionBody: limitedFunctionBody,
							modelType: "groq",
							document,
							diagnostic,
							userToken
						});
						if (response) {
							const data = JSON.parse(response);
							suggestions.push(data);
						}
					}
				}
				currentCount++;
			}
		return suggestions;
	}

	public getDiagnostic(
		documentUri: string,
		documentVersion: number
	): Diagnostic[] | undefined {
		const entry = this.diagnostics.get(documentUri);
		if (
			entry &&
			entry.settingsVersion === settingsVersion &&
			entry.documentVersion === documentVersion
		) {
			return entry.diagnostics;
		}
		return undefined;
	}

	public setDiagnostic(
		documentUri: string,
		documentVersion: number,
		diagnostics: Diagnostic[]
	): void {
		this.diagnostics.set(documentUri, {
			diagnostics,
			documentVersion,
			settingsVersion,
		});
	}

	public isDiagnosticCached(documentUri: string): boolean {
		return this.diagnostics.has(documentUri);
	}

	public deleteDiagnostic(documentUri: string): void {
		this.diagnostics.delete(documentUri);
	}

	public isDiagnosticsOutdated(document: TextDocument): boolean {
		const cacheEntry = this.diagnostics.get(document.uri);
		return (
			!cacheEntry ||
			cacheEntry.settingsVersion !== settingsVersion ||
			cacheEntry.documentVersion !== document.version
		);
	}

	public clearDiagnostics(uri: string) {
		this.connection.sendDiagnostics({ uri, diagnostics: [] });
	}

	public handleError(error: Error) {
		const message = error?.message || error.toString();

		if (error.toString().includes("Could not access 'HEAD'")) {
			const actionText = "Create Repository";
			const params = {
				type: MessageType.Error,
				message:
					"Failed to find Git Repository. Please create a git repository to continue using the extension.",
				actions: [
					{ title: actionText }, // MessageActionItem
				],
			};

			// https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#messageType
			this.connection.sendRequest("Error", params).then((selectedAction) => {
				if (selectedAction === actionText) {
					console.log("Creating repository");
					// Trigger the client-side command to create the repository
					this.connection.sendRequest("workspace/executeCommand", {
						command: "extension.createRepository",
					});
				}
			});
		} else if (
			message.includes("SyntaxError") ||
			message.includes("IndentationError") ||
			message.includes("Unexpected token")
		) {
			// @rome-ignore we're not worried about syntax errors triggered by the user's code
			return;
		} else {
			console.log(error);
			LOGGER.error(error);
		}
	}

	protected validateVariableName({
		variableName,
		variableValue,
	}: {
		variableName: string;
		variableValue: any;
	}): { violates: boolean; reason: string } {
		if (!variableName || variableName.toLowerCase() === "id") {
			return { violates: false, reason: "" };
		}
		const {
			expressiveNames: { variables },
			boolean,
		} = this.getConventions();
	
		if (!variables.isEnabled) return { violates: false, reason: "" };

		const nameWithoutUnderscorePrefix = variableName.startsWith("_") ? variableName.substring(1) : variableName;
	
		if (variables.avoidShortNames && nameWithoutUnderscorePrefix.length < 3) {
			return {
				violates: true,
				reason: RULE_MESSAGES.NAME_TOO_SHORT.replace("{name}", variableName),
			};
		}
		
		const isExplicitBoolean =
			typeof variableValue === "boolean" ||
			/^(true|false)$/i.test(variableValue);
		if (boolean && (isLikelyBoolean(nameWithoutUnderscorePrefix) || isExplicitBoolean)) {
			const prefixes = this.settings.general.prefixes;
			const { positiveNaming, usePrefix } = boolean;
			if (
				usePrefix &&
				!prefixes.some((prefix) => nameWithoutUnderscorePrefix.startsWith(prefix))
			) {
				return {
					violates: true,
					reason: RULE_MESSAGES.BOOLEAN_NO_PREFIX.replace("{name}", variableName),
				};
			}
			if (positiveNaming && hasNegativePattern(nameWithoutUnderscorePrefix)) {
				return {
					violates: true,
					reason: RULE_MESSAGES.BOOLEAN_NEGATIVE_PATTERN.replace("{name}", variableName),
				};
			}
		}


		// TODO: add rule for determining whether the name is a valid word (e.g. "usr" is not a valid word)

		return { violates: false, reason: "" };
	}

	protected validateObjectPropertyName({
		objectKey,
		objectValue,
	}: {
		objectKey: string;
		objectValue: any;
	}): { violates: boolean; reason: string } {
		if (!objectKey) {
			console.warn("No key name found.");
			return { violates: false, reason: "" };
		}

		const {
			expressiveNames: { objectProperties },
			boolean,
		} = this.getConventions();

		if (!objectProperties.isEnabled) return { violates: false, reason: "" };
	
		const nameWithoutUnderscorePrefix = objectKey.startsWith("_") ? objectKey.substring(1) : objectKey;
	
		if (
			nameWithoutUnderscorePrefix.toLowerCase() !== "id" &&
			objectProperties.avoidShortNames &&
			nameWithoutUnderscorePrefix.length <= 2
		) {
			return {
				violates: true,
				reason: RULE_MESSAGES.OBJECT_KEY_TOO_SHORT.replace("{name}", objectKey),
			};
		}

		const isExplicitBoolean =
			typeof objectValue === "boolean" || objectValue?.type === "BooleanLiteral" ||
			/^(true|false)$/i.test(objectValue);
		if (boolean && (isLikelyBoolean(nameWithoutUnderscorePrefix) || isExplicitBoolean)) {
			const prefixes = this.settings.general.prefixes;
			const { positiveNaming, usePrefix } = boolean;
			if (
				usePrefix &&
				!prefixes.some((prefix) => nameWithoutUnderscorePrefix.startsWith(prefix))
			) {
				return {
					violates: true,
					reason: RULE_MESSAGES.OBJECT_KEY_BOOLEAN_NO_PREFIX.replace("{name}", objectKey),
				};
			}
			if (positiveNaming && hasNegativePattern(nameWithoutUnderscorePrefix)) {
				return {
					violates: true,
					reason: RULE_MESSAGES.OBJECT_KEY_BOOLEAN_NEGATIVE_PATTERN.replace("{name}", objectKey),
				};
			}
		}
	
		// TODO: add rule for determining whether the name is a valid word (e.g. "usr" is not a valid word)
	
		return { violates: false, reason: "" };
	}

	protected validateThemeSystemUsage(code: string): ThemeSystemViolation[]{
		const { themeSystem } = this.getConventions();
		if (!themeSystem?.isEnabled) {
			return [];
		}

		const violations:  ThemeSystemViolation[] = [];
		const regexHex = /#[0-9a-fA-F]{3,6}\b/g;
		
		if (themeSystem.shouldFlagHexCodes) {
			let match;
			while ((match = regexHex.exec(code)) !== null) {
				const foundHexCode = match[0];
				violations.push({
					reason: RULE_MESSAGES.THEME_SYSTEM_VIOLATION_HEXCODES.replace("{value}", foundHexCode),
					violates: true,
					index: match.index,
					value: foundHexCode
				});
			}
		}
	
		return violations;
	}
	

	public isTodoOrFixme(comment: string): boolean {
		return /^(TODO|FIXME)/i.test(comment.trim());
	}

	public isIgnoreComment(comment: string): boolean {
		return /^@ROME-IGNORE/i.test(comment.trim());
	}

	public isCommentRedundant(
		comment: string,
		currentNode: any
	): { violates: boolean; reason: string } {
		const generalIdentifiers = [
			"Block",
			"IfStatement",
			"ForStatement",
			"return",
			"assignment",
		];
		const javascriptIdentifiers = [
			"VariableDeclaration",
			"ReturnStatement",
			"ExpressionStatement",
			"CallExpression",
		];
		const pythonIdentifiers = ["name", "classdef", "functiondef"];
		const djangoIdentifiers = [
			"django_method",
			"django_model",
			"django_model_field",
			"django_serializer_field",
			"django_model_method",
			"django_serializer_method",
			"django_view_method",
			"django_test_method",
		];
		const languageIdentifiers = generalIdentifiers.concat(
			javascriptIdentifiers,
			pythonIdentifiers,
			djangoIdentifiers
		);

		if (this.isTodoOrFixme(comment)) {
			return {
				violates: false,
				reason: "Comments prefixed with TODO or FIXME are ignored.",
			};
		} else if (this.isIgnoreComment(comment)) {
			return {
				violates: false,
				reason: "@rome-ignore detected for this comment.",
			};
		} else if (languageIdentifiers.includes(currentNode.type)) {
			// TODO: What do we consider a simple expression?
			return {
				violates: true,
				reason:
					"This comment may not be necessary as the code below it is self-explanatory.",
			};
		} else {
			return { violates: false, reason: "" };
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

	generateVariableNameMessage(message: string, document: TextDocument, diagnostic: Diagnostic) {
		const variableUsage = this.getSurroundingCode(document, diagnostic.range);
		message = `${message} Note: align the suggestion with ${this.languageId} naming conventions (e.g., snake_case, camelCase). Here is the variable usage for context:\n\n${variableUsage}`;

		const { expressiveNames: { variables } } = this.getConventions();
        if (variables.examples.length === 0) {
			return message;
			}
		console.log("Variable examples: ", variables.examples);
        const variableExamples = variables.examples.join(', ');

		message += `\n\nHere are some examples of variable naming conventions used in ${this.languageId} projects:\nVariables: ${variableExamples}\n\nConsider these conventions when generating your suggestion.`;
		return message;
    }

	generateFunctionMessage(message: string, functionBody: string,  document: TextDocument, diagnostic: Diagnostic) {
        const surroundingCode = this.getSurroundingCode(document, diagnostic.range);
		message = `${message} Note: align the suggestion with ${this.languageId} naming conventions (e.g., snake_case, camelCase, PascalCase). Here is the function body for context:\n\n${functionBody}\n\nConsider the following surrounding code when generating your suggestion:\n\n${surroundingCode}`;
		message += `\n\nEnsure the function name begins with a verb from the approved list that best describes the function's purpose: ${actionWordsValues.join(', ')}.`;

		const { expressiveNames: { functions } } = this.getConventions();
		if (functions.examples.length === 0) {
            return message;
        }
		console.log("Function examples: ", functions.examples);
		const functionExamples = functions.examples.join(', ');

		message += `\n\nFor additional context, here are examples of naming conventions used in this project:\n\n${functionExamples}`;
		return message;
    }

	protected async fetchSuggestedNameFromLLM({
		message,
		document,
		diagnostic,
		userToken,
		functionBody,
		modelType,
	}: {
		message: string;
		modelType: "groq" | "openai";
		document: TextDocument;
		diagnostic: Diagnostic;
		userToken: string;
		functionBody?: string;
	}): Promise<any> {
		let requestMessage = message;
		if (functionBody) {
			requestMessage = this.generateFunctionMessage(message, functionBody, document, diagnostic);
		} else {
			requestMessage = this.generateVariableNameMessage(message, document, diagnostic);
		}
		
		try {
			if (modelType === "openai") {
				return await chatWithOpenAI(this.systemMessage, requestMessage, userToken);
			} else if (modelType === "groq") {
				return await chatWithGroq(this.systemMessage, requestMessage, userToken);
			}
		} catch (error: any) {
			if (error.error?.type === "invalid_request_error") {
				LOGGER.error("InvalidRequestError:", error.error);
			} else {
				LOGGER.error("Error fetching suggested name from LLM:", error);
			}
			return null;
		}
	}

	private sendNotSupportedMessage(languageId: string): void {
		const messageParams: ShowMessageRequestParams = {
			type: MessageType.Warning,
			message: `The language ${languageId} is not currently supported by When In Rome extension.`,
			actions: [{ title: "Dismiss" }],
		};
		this.connection
			.sendRequest("window/showMessageRequest", messageParams)
			.then((response) => {
				if (response) {
					console.log(`User dismissed the message for ${languageId} support.`);
				}
			});
	}
}
