import {
	Connection,
	Diagnostic,
	CodeAction,
	CodeActionKind,
	MessageType,
	ShowMessageRequestParams,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

import { groqModel } from "../llm/groq";
import { openAIModel } from "../llm/openai";

import { systemMessageWithJsonResponse } from "../constants/chat";
import {
	isLikelyBoolean,
	hasNegativePattern,
	getChangedLinesFromClient,
	containsAbbreviation,
} from "../utils";
import { ExtensionSettings, defaultConventions } from "../settings";
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
			version: number;
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

	public async provideDiagnostics(
		document: TextDocument
	): Promise<Diagnostic[]> {
		const conventions = this.getConventions();
		if (!conventions.isEnabled) return [];

		this.deleteDiagnostic(document.uri);
		const diagnostics: Diagnostic[] = [];

		let changedLines: Set<number> | undefined = undefined;
		if (this.settings.onlyCheckNewCode) {
			changedLines = await getChangedLinesFromClient(
				this.connection,
				document.uri
			);
			if (changedLines && changedLines.size === 0) {
				return diagnostics; // No changes, no need to process diagnostics
			}
		}

		return this.runDiagnostics(document, diagnostics, changedLines);
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

	public getDiagnostic(documentUri: string): Diagnostic[] | undefined {
		const entry = this.diagnostics.get(documentUri);
		if (entry) {
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
			version: documentVersion,
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
		return !cacheEntry || document.version > cacheEntry.version;
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
			if (!this.settings.isDevMode) {
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
		const conventions = this.getConventions();

		if (conventions.expressive) {
			const minLength = conventions.avoidAbbreviation ? 3 : 2;
			if (variableName.length < minLength) {
				return {
					violates: true,
					reason: `Name "${variableName}" is too short, violating expressiveness rules.`,
				};
			}
		}

		if (conventions.avoidAbbreviation && containsAbbreviation(variableName)) {
			return {
				violates: true,
				reason: `Name "${variableName}" contains abbreviations, which are to be avoided.`,
			};
		}

		const isExplicitBoolean =
			typeof variableValue === "boolean" ||
			/^(true|false)$/i.test(variableValue);
		if (
			conventions.boolean &&
			(isLikelyBoolean(variableName) || isExplicitBoolean)
		) {
			const prefixes = this.settings.prefixes;
			const { positiveNaming, usePrefix } = conventions.boolean;
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
		if (currentNode.type === "return") {
			console.log("Current node type:", currentNode.type);
			console.log("Comment:", comment);
		}
		const generalIdentifiers = [
			"Block",
			"IfStatement",
			"ForStatement",
			"return",
		];
		const javascriptIdentifiers = [
			"VariableDeclaration",
			"ReturnStatement",
			"ExpressionStatement",
		];
		const pythonIdentifiers = ["name", "classdef", "functiondef"];
		const djangoIdentifiers = [
			"django_method",
			"django_model",
			"django_model_field",
			"django_serializer_field",
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
					"Simple expressions, return statements, and one-liners are self-explanatory.",
			};
		} else {
			return { violates: false, reason: "" };
		}
	}

	async chatWithOpenAI(developerInput: string) {
		const response = await openAIModel.invoke([
			["system", systemMessageWithJsonResponse],
			["human", developerInput],
		]);
		if (!response || !response.content) {
			console.log("Error while fetching response from OpenAI", response);
			throw new Error("Error while fetching response from OpenAI");
		}
		return response.content;
	}

	async chatWithGroq(developerInput: string) {
		const response = await groqModel.invoke(
			[
				["system", systemMessageWithJsonResponse],
				["human", developerInput],
			],
			{
				response_format: { type: "json_object" },
			}
		);
		console.log("Grok response", response);

		if (!response || !response.content) {
			console.log("Error while fetching response from LLM", response);
			throw new Error("Error while fetching response from LLM");
		}
		return response.content;
	}

	protected async fetchSuggestedNameFromLLM({
		message,
		modelType,
	}: {
		message: string;
		modelType: "groq" | "openai";
	}): Promise<any> {
		if (modelType === "openai") {
			return await this.chatWithOpenAI(message);
		} else if (modelType === "groq") {
			return await this.chatWithGroq(message);
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
