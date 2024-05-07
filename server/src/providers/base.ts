import {
	Connection,
	Diagnostic,
	CodeAction,
	CodeActionKind,
	MessageType,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

import { groqModel } from "../llm/groq";
import { openAIModel } from "../llm/openai";

import { systemMessageWithJsonResponse } from "../constants/chat";
import {
	isLikelyBoolean,
	hasBooleanPrefix,
	hasNegativePattern,
	getChangedLinesFromClient,
} from "../utils";
import { ExtensionSettings, defaultConventions } from "../settings";
import { rollbar } from "../common/logs";

import type { LanguageConventions } from "../languageConventions";

export abstract class LanguageProvider {
	protected connection: Connection;
	protected cache: Map<string, any>;
	protected cancellationId: number = 0;
	protected conventions: any;
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
		this.loadConventions(settings.languages[languageId]);
	}

	abstract provideCodeActions(document: TextDocument): Promise<CodeAction[]>;

	private loadConventions(conventions?: LanguageConventions): void {
		this.conventions =
			conventions || defaultConventions.languages[this.languageId];
	}

	public async provideDiagnostics(
		document: TextDocument
	): Promise<Diagnostic[]> {
		if (!this.conventions.conventions[document.languageId].isEnabled) {
			return [];
		}

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
			if (!this.conventions.isDevMode) {
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

		const { variable, boolean: booleanConventions } = this.conventions;

		if (variable.expressive && variable.avoidAbbreviation) {
			if (variableName.length < 3) {
				return {
					violates: true,
					reason: `Name "${variableName}" is too short or an abbreviation which violates rule "Expressive names".`,
				};
			}
		} else if (variable.expressive && !variable.avoidAbbreviation) {
			if (variableName.length < 2) {
				return {
					violates: true,
					reason: `Name "${variableName}" is too short which violates rule "Expressive names".`,
				};
			}
		}

		// FIXME: disabled for now as we can use linting tools for this later if needed
		// if (!validateVariableNameCase(variableName, languageId)) {
		// 	const namingStyle = languageId === "python" ? "snake_case" : "camelCase";
		// 	return {
		// 		violates: true,
		// 		reason: `"${variableName}" does not follow "${namingStyle}" naming convention.`,
		// 	};
		// }
		const isExplicitBoolean = /True|False/i.test(variableValue);
		if (
			booleanConventions &&
			booleanConventions.prefix &&
			(isLikelyBoolean(variableName) || isExplicitBoolean)
		) {
			if (!hasBooleanPrefix(variableName, booleanConventions.prefix)) {
				return {
					violates: true,
					reason: `Boolean variable "${variableName}" does not start with a conventional prefix (e.g. is, has, can).`,
				};
			}
			if (hasNegativePattern(variableName)) {
				return {
					violates: true,
					reason: `Boolean variable "${variableName}" has a negative naming pattern.`,
				};
			}
		}
		return { violates: false, reason: "" };
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
}
