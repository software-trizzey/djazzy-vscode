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
	containsAbbreviation,
} from "../utils";
import {
	ExtensionSettings,
	defaultConventions,
	settingsVersion,
} from "../settings";
import { rollbar } from "../common/logs";

import type { LanguageConventions } from "../languageConventions";

export abstract class LanguageProvider {
	protected connection: Connection;
	protected cache: Map<string, any>;
	protected cancellationId: number = 0;
	protected conventions?: LanguageConventions;
	protected settings: ExtensionSettings;

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
	}

	abstract provideCodeActions(document: TextDocument): Promise<CodeAction[]>;

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
		diagnostic: Diagnostic
	): Promise<CodeAction>;

	public static readonly providedCodeActionKinds = [
		CodeActionKind.QuickFix,
		CodeActionKind.Refactor,
	];

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
		} else {
			if (!this.settings.general.isDevMode) {
				rollbar.error(error);
				return;
			}
			console.error(error);
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

		const minLength = variables.avoidAbbreviation ? 3 : 2;
		if (variableName.length < minLength) {
			return {
				violates: true,
				reason: `Name "${variableName}" is too short, violating expressiveness rules.`,
			};
		}

		if (variables.avoidAbbreviation && containsAbbreviation(variableName)) {
			return {
				violates: true,
				reason: `Name "${variableName}" contains abbreviations, which are to be avoided.`,
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
		console.log("COMMENT", comment, currentNode.type);
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
		console.log("Limit function body size", functionBody.length, maxLength);
		if (functionBody.length <= maxLength) {
			return functionBody;
		}
		return functionBody.substring(0, maxLength);
	}

	protected getFunctionBodyRange(
		document: TextDocument,
		functionRange: Range
	): Range {
		console.log("Get function body range", functionRange);
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

	protected async fetchSuggestedNameFromLLM({
		message,
		functionBody,
		modelType,
	}: {
		message: string;
		functionBody?: string;
		modelType: "groq" | "openai";
		languageId?: string;
	}): Promise<any> {
		message = `${message} Note: align suggestion with ${this.languageId} naming conventions (i.e. snakecase, camelcase, etc.).`;
		if (functionBody) {
			message += ` Here is the function body for context:\n\n${functionBody}`;
		}

		if (modelType === "openai") {
			return await chatWithOpenAI(message);
		} else if (modelType === "groq") {
			return await chatWithGroq(message);
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
