import {
	Connection,
	Diagnostic,
	CodeAction,
	CodeActionKind,
	Position,
	MessageType,
	ShowMessageRequestParams,
	Range as LspRange,
	DiagnosticSeverity,
} from "vscode-languageserver/node";

import { TextDocument, Range } from "vscode-languageserver-textdocument";

import { chatWithLLM } from "../llm/chat";

import {
	isLikelyBoolean,
	hasNegativePattern,
	getChangedLinesFromClient,
} from "../utils";
import {
	ExtensionSettings,
	cachedUserToken,
	defaultConventions,
	settingsVersion,
} from "../settings";
import LOGGER from "../common/logs";

import type { LanguageConventions } from "../languageConventions";
import { RULE_MESSAGES } from '../constants/rules';
import { NAMING_CONVENTION_VIOLATION_SOURCE_TYPE, SOURCE_NAME } from '../constants/diagnostics';
import { ContextType, DeveloperInput, FunctionContext, Models, ThemeSystemViolation, VariableContext } from '../llm/types';

const VARIABLES_TO_IGNORE = [
	"ID", "PK", "DEBUG", "USE_I18N", "USE_L10N", "USE_TZ", "CSRF_COOKIE_SECURE", "SESSION_COOKIE_SECURE"
];


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

	protected clearNPlusOneCache(): void {
        // Note: This method should be implemented in the DjangoProvider subclass
    }

	public updateSettings(settings: ExtensionSettings): void {
		this.settings = settings;
		this.updateConventions(settings);
	}

	public updateConfiguration(settings: ExtensionSettings): void {
        this.settings = settings;
        this.updateConventions(settings);

        if (this.languageId === 'python' && 
            settings.general.nPlusOneMinimumSeverityThreshold !== 
            this.getStoredSettings().general.nPlusOneMinimumSeverityThreshold) {
            this.clearNPlusOneCache();
        }
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

	abstract provideCodeActions(
		document: TextDocument,
		userToken: string
	): Promise<CodeAction[]>;

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
			// djangoly-ignore we're not worried about syntax errors triggered by the user's code
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
		if (!variableName || VARIABLES_TO_IGNORE.includes(variableName.toUpperCase())) {
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
		return /^djangoly-IGNORE/i.test(comment.trim());
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
				reason: "djangoly-ignore detected for this comment.",
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

	protected generateVariableContext(document: TextDocument, diagnostic: Diagnostic, variableName: string): VariableContext {
		const usage = this.getSurroundingCode(document, diagnostic.range);
		const { expressiveNames: { variables } } = this.getConventions();
		
		return {
			name: variableName,
			type: ContextType.variable,
			usage,
			surroundingCode: usage,
			examples: variables.examples,
			languageId: this.languageId
		};
	}
	
	protected generateFunctionContext(document: TextDocument, diagnostic: Diagnostic, functionName: string, functionBody: string): FunctionContext {
		const surroundingCode = this.getSurroundingCode(document, diagnostic.range);
		const { expressiveNames: { functions } } = this.getConventions();
		
		return {
			name: functionName,
			type: ContextType.function,
			usage: functionBody,
			surroundingCode,
			examples: functions.examples,
			languageId: this.languageId
		};
	}

	protected async fetchSuggestedNameFromLLM({
		flaggedName,
		message,
		document,
		diagnostic,
		userToken,
		functionBody,
		modelId,
	}: {
		flaggedName: string;
		message: string;
		modelId: Models;
		document: TextDocument;
		diagnostic: Diagnostic;
		userToken: string;
		functionBody?: string;
	}): Promise<{
		originalName: string;
		suggestedName: string;
		justification: string;
	} | null> {
        let context: VariableContext | FunctionContext;
        if (functionBody) {
            context = this.generateFunctionContext(document, diagnostic, flaggedName, functionBody);
        } else {
            context = this.generateVariableContext(document, diagnostic, flaggedName);
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

    createDiagnostic(
		range: Range,
		message: string,
		severity: DiagnosticSeverity,
		sourceType = NAMING_CONVENTION_VIOLATION_SOURCE_TYPE
	): Diagnostic {
        return Diagnostic.create(
            range,
            message,
            severity,
            sourceType,
            SOURCE_NAME
        );
    }

	private sendNotSupportedMessage(languageId: string): void {
		const messageParams: ShowMessageRequestParams = {
			type: MessageType.Warning,
			message: `The language ${languageId} is not currently supported by Djangoly extension.`,
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

	public reportFalsePositive(document: TextDocument, diagnostic: Diagnostic): void {
        const diagnosticId = (diagnostic.data as { id: string }).id;
        LOGGER.info(`False positive reported`, {
            userId: cachedUserToken,
            diagnosticId: diagnosticId,
            timestamp: new Date().toISOString()
        });
        // TODO: Additional logic for handling false positive reports
    }
}
