import {
	Connection,
	Diagnostic,
	CodeAction,
	CodeActionKind,
	MessageType,
	ShowMessageNotification,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

import { groqModel } from "../llm/groq";
import { openAIModel } from "../llm/openai";

import defaultConventions from "../defaultConventions";
import { systemMessageWithJsonResponse } from "../constants/chat";
import {
	validateVariableNameCase,
	isLikelyBoolean,
	hasBooleanPrefix,
	hasNegativePattern,
} from "../utils";
import { ExtensionSettings } from "../settings";

export abstract class LanguageProvider {
	protected cache: Map<string, any>;
	protected cancellationId: number = 0;
	protected defaultConventions: any;

	protected diagnostics: Map<string, Diagnostic[]> = new Map();

	protected connection: Connection;
	protected isEnabled: boolean;
	protected onlyCheckNewCode: boolean;
	protected isDevMode: boolean = false;
	protected mockFetchSuggestedName: boolean = false;

	constructor(
		protected languageId: keyof typeof defaultConventions,
		connection: Connection,
		settings: ExtensionSettings
	) {
		this.connection = connection;
		this.cache = new Map<string, any>();

		this.onlyCheckNewCode = settings.onlyCheckNewCode;
		this.isDevMode = settings.isDevMode;
		this.mockFetchSuggestedName = settings.mockFetchSuggestedName;

		if (languageId === "javascript") {
			this.isEnabled = settings.isJavascriptEnabled;
		} else if (languageId === "typescript") {
			this.isEnabled = settings.isTypescriptEnabled;
		} else if (languageId === "python") {
			this.isEnabled = settings.isPythonEnabled;
		} else {
			// FIXME: disabled React for now
			this.isEnabled = false;
		}

		this.languageId = languageId;
		this.defaultConventions = defaultConventions[languageId];
	}

	abstract provideDiagnostics(document: TextDocument): Promise<void>;

	abstract generateFixForNamingConventionViolation(
		document: TextDocument,
		diagnostic: Diagnostic
	): Promise<CodeAction>;

	public static readonly providedCodeActionKinds = [
		CodeActionKind.QuickFix,
		CodeActionKind.Refactor,
	];

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
			this.connection.console.error(`Error: ${error.toString()}`);
			this.connection.sendNotification(ShowMessageNotification.type, {
				type: MessageType.Error,
				message: error.toString(),
			});
		}
	}

	protected validateVariableName({
		variableName,
		variableValue,
		languageId,
	}: {
		variableName: string;
		variableValue: any;
		languageId: string;
	}): { violates: boolean; reason: string } {
		if (!variableName) {
			console.warn("No variable name found.");
			return { violates: false, reason: "" };
		}

		const { variable, boolean: booleanConventions } = this.defaultConventions;

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

		if (!validateVariableNameCase(variableName, languageId)) {
			const namingStyle = languageId === "python" ? "snake_case" : "camelCase";
			return {
				violates: true,
				reason: `"${variableName}" does not follow "${namingStyle}" naming convention.`,
			};
		}
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
