import * as fs from "fs";
import * as path from "path";

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
	workspaceRoot,
} from "../settings";
import LOGGER from "../common/logs";

import type { LanguageConventions } from "../languageConventions";

export abstract class LanguageProvider {
	protected connection: Connection;
	protected cache: Map<string, any>;
	protected cancellationId: number = 0;
	protected conventions?: LanguageConventions;
	protected namingConventionExamples; // it'll be JSON
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
		this.namingConventionExamples = this.loadNamingConventionExamples();

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

	loadNamingConventionExamples() {
		if (!workspaceRoot) {
			console.warn('Workspace root not set');
			return null;
		}
		const configPath = path.join(workspaceRoot, 'naming_conventions.rome.json');
		if (fs.existsSync(configPath)) {
			const rawData = fs.readFileSync(configPath);
			return JSON.parse(rawData.toString());
		} else {
			console.warn('Naming conventions file not found');
			return null;
		}
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
		diagnostic: Diagnostic
	): Promise<CodeAction | undefined>;

	public static readonly providedCodeActionKinds = [
		CodeActionKind.QuickFix,
		CodeActionKind.Refactor,
	];

	public async provideCodeActions(
		document: TextDocument
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
				this.generateFixForNamingConventionViolation(document, diagnostic)
			)
			.filter((promise) => promise !== undefined) as Promise<CodeAction>[];
		return await Promise.all(actionPromises);
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

	isDiagnosticsOutdated(document: TextDocument): boolean {
		const cacheEntry = this.diagnostics.get(document.uri);
		return (
			!cacheEntry ||
			cacheEntry.settingsVersion !== settingsVersion ||
			cacheEntry.documentVersion !== document.version
		);
	}

	public handleError(error: Error) {
		const message = error?.message || error.toString();
		console.log("Error message:", message);

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
			message.includes("IndentationError")
		) {
			// @rome-ignore - gracefully catch and log user generated syntax errors
			LOGGER.debug(error);
		} else {
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
		if (!variableName) {
			console.warn("No variable name found.");
			return { violates: false, reason: "" };
		}
		const {
			expressiveNames: { variables },
			boolean,
		} = this.getConventions();

		if (!variables.isEnabled) return { violates: false, reason: "" };

		// TODO: rename this value to avoidShortNames
		if (variables.avoidShortNames && variableName.length < 3) {
			return {
				violates: true,
				reason: `Variable "${variableName}" is too short and must be more descriptive`,
			};
		}

		const isExplicitBoolean =
			typeof variableValue === "boolean" ||
			/^(true|false)$/i.test(variableValue);
		if (boolean && (isLikelyBoolean(variableName) || isExplicitBoolean)) {
			const prefixes = this.settings.general.prefixes;
			const { positiveNaming, usePrefix } = boolean;
			if (
				usePrefix &&
				!prefixes.some((prefix) => variableName.startsWith(prefix))
			) {
				const prefixExamples = prefixes.join(", ");
				return {
					violates: true,
					reason: `Boolean variable "${variableName}" does not start with a conventional prefix (e.g., ${prefixExamples}).`,
				};
			}
			if (positiveNaming && hasNegativePattern(variableName)) {
				return {
					violates: true,
					reason: `Boolean variable "${variableName}" has a negative naming pattern, which contradicts the positive naming convention.`,
				};
			}
		}
		return { violates: false, reason: "" };
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

	getProjectNamingExamples() {
		// FIXME: This is a placeholder. Implement logic to gather examples from the project.
		return `
		- Existing function names: calculateArea, fetchData, isUserLoggedIn
		- Variable names: user_id, totalAmount, isActive
		`;
	}

	generateVariableNameMessage(message: string, document: TextDocument, diagnostic: Diagnostic) {
		const variableUsage = this.getSurroundingCode(document, diagnostic.range);
		message = `${message} Note: align the suggestion with ${this.languageId} naming conventions (e.g., snake_case, camelCase). Here is the variable usage for context:\n\n${variableUsage}`;

        if (!this.namingConventionExamples || !this.namingConventionExamples.languages[this.languageId]) {
            return message;
        }
        const variableExamples = this.namingConventionExamples.languages[this.languageId].variables.join(', ');

		message += `\n\nHere are some examples of variable naming conventions used in ${this.languageId} projects:\nVariables: ${variableExamples}\n\nConsider these conventions when generating your suggestion.`;
		return message;
    }

	generateFunctionMessage(message: string, functionBody: string,  document: TextDocument, diagnostic: Diagnostic) {
        const surroundingCode = this.getSurroundingCode(document, diagnostic.range);
		message = `${message} Note: align the suggestion with ${this.languageId} naming conventions (e.g., snake_case, camelCase, PascalCase). Here is the function body for context:\n\n${functionBody}\n\nConsider the following surrounding code when generating your suggestion:\n\n${surroundingCode}`;

		if (!this.namingConventionExamples || !this.namingConventionExamples.languages[this.languageId]) {
            return message;
        }
		const functionExamples = this.namingConventionExamples.languages[this.languageId].functions.join(', ');

		message += `\n\nFor additional context, here are examples of naming conventions used in this project:\n\n${functionExamples}`;
		return message;
    }

	protected async fetchSuggestedNameFromLLM({
		message,
		document,
		diagnostic,
		functionBody,
		modelType,
	}: {
		message: string;
		modelType: "groq" | "openai";
		document: TextDocument;
		diagnostic: Diagnostic;
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
				return await chatWithOpenAI(this.systemMessage, requestMessage);
			} else if (modelType === "groq") {
				return await chatWithGroq(this.systemMessage, requestMessage);
			}
		} catch (error: any) {
			if (error.error.type === "invalid_request_error") {
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
