import {
	Connection,
	CodeAction,
	CodeActionKind,
	Command,
	Diagnostic,
	DiagnosticSeverity,
	Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import * as babelParser from "@babel/parser";
import traverse from "@babel/traverse";

import { LanguageProvider } from "./base";
import defaultConventions from "../defaultConventions";

import {
	debounce,
	validateJavaScriptAndTypeScriptFunctionNameCase,
} from "../utils";

import { getChangedLinesFromClient } from "../utils";
import { ExtensionSettings } from "../settings";
import { FIX_NAME } from "../constants/commands";

export class JavascriptAndTypescriptProvider extends LanguageProvider {
	private isTypeScript: boolean = false;
	private codeActionsMessageCache: Map<string, CodeAction> = new Map();

	provideDiagnosticsDebounced: (document: TextDocument) => void;

	private async triggerDiagnostics(document: TextDocument) {
		await this.provideDiagnostics(document);
	}

	constructor(
		languageId: keyof typeof defaultConventions,
		connection: Connection,
		settings: ExtensionSettings
	) {
		super(languageId, connection, settings);

		if (languageId === "typescript") {
			this.isTypeScript = true;
		}

		const timeoutInMilliseconds = 1000;
		this.provideDiagnosticsDebounced = debounce(
			(document) => this.triggerDiagnostics(document),
			timeoutInMilliseconds
		);
	}

	async provideCodeActions(document: TextDocument): Promise<CodeAction[]> {
		const diagnostics = document.uri ? this.getDiagnostic(document.uri) : [];
		if (!diagnostics) return [];
		const namingConventionDiagnostics = diagnostics.filter(
			(diagnostic) => diagnostic.code === "namingConventionViolation"
		);
		const actionPromises = namingConventionDiagnostics.map((diagnostic) =>
			this.generateFixForNamingConventionViolation(document, diagnostic)
		);
		return await Promise.all(actionPromises);
	}

	async generateFixForNamingConventionViolation(
		document: TextDocument,
		diagnostic: Diagnostic
	): Promise<CodeAction> {
		const flaggedName = document.getText(diagnostic.range);
		const violationMessage = diagnostic.message;
		const cacheKey = `${violationMessage}-${diagnostic.range.start.line}-${diagnostic.range.start.character}`;
		const cachedAction = this.codeActionsMessageCache.get(cacheKey);
		let suggestedName = "";

		console.log("Checking cache for action", cacheKey, cachedAction);
		if (cachedAction) {
			console.log("Returning cached action", cachedAction);
			return cachedAction;
		}

		console.log("Generating new action");
		if (
			violationMessage.includes('does not follow "camelCase" naming convention')
		) {
			const camelCasedName = flaggedName.replace(/[-_](.)/g, (_, c) =>
				c.toUpperCase()
			);
			suggestedName = camelCasedName;
		} else if (violationMessage.includes("has a negative naming pattern")) {
			suggestedName = flaggedName.replace(/not/i, "");
		} else if (
			violationMessage.includes("does not start with a recognized action word")
		) {
			if (this.isDevMode && this.mockFetchSuggestedName) {
				suggestedName = `get${flaggedName}`;
			} else {
				const response = await this.fetchSuggestedNameFromLLM({
					message: violationMessage,
					modelType: "groq",
				});
				const data = JSON.parse(response);
				suggestedName = data.suggestedName;
				// TODO: Provide justification for action words?
				// const justification = data.justification;
			}
		}
		const title = `Rename to '${suggestedName}'`;
		const range = diagnostic.range;
		const cmd = Command.create(
			title,
			FIX_NAME,
			document.uri,
			suggestedName,
			range
		);
		const fix = CodeAction.create(title, cmd, CodeActionKind.QuickFix);
		fix.isPreferred = true;
		this.codeActionsMessageCache.set(cacheKey, fix);
		return fix;
	}

	public async provideDiagnostics(
		document: TextDocument
	): Promise<Diagnostic[]> {
		if (this.languageId === "javascript" && !this.isEnabled) return [];
		if (this.languageId === "typescript" && !this.isEnabled) return [];

		this.deleteDiagnostic(document.uri);

		const diagnostics: Diagnostic[] = [];
		const diagnosticPromises: Promise<void>[] = [];
		try {
			let changedLines: Set<number> | undefined = undefined;
			if (this.onlyCheckNewCode) {
				changedLines = await getChangedLinesFromClient(
					this.connection,
					document.uri
				);
				if (changedLines && changedLines.size === 0) {
					return diagnostics;
				}
			}
			console.log("changedLines", changedLines, typeof changedLines);

			const text = document.getText();
			const pluginOptions: babelParser.ParserPlugin[] = [
				"logicalAssignment",
				"classProperties",
				"optionalChaining",
				"nullishCoalescingOperator",
				"objectRestSpread",
			];
			if (this.isTypeScript) {
				pluginOptions.push("typescript");
			}

			const ast = babelParser.parse(text, {
				sourceType: "module",
				plugins: pluginOptions,
				errorRecovery: true,
			});
			traverse(ast, {
				VariableDeclaration: ({ node }) => {
					node.declarations.forEach((declaration) => {
						if (
							declaration.loc &&
							(!this.onlyCheckNewCode ||
								changedLines?.has(declaration.loc.start.line))
						) {
							this.applyVariableDeclarationDiagnostics(
								declaration,
								diagnostics,
								document
							);
						}
					});
				},
				/**
				 * Validate: function myFunction() {} | Ignore: function() {}
				 */
				FunctionDeclaration: ({ node }) => {
					if (!node.loc || node.type !== "FunctionDeclaration" || !node.id) {
						return;
					}

					if (
						!this.onlyCheckNewCode ||
						changedLines?.has(node.loc.start.line)
					) {
						diagnosticPromises.push(
							this.checkFunctionAndAddDiagnostic(
								node.id.name,
								node.id,
								document,
								diagnostics
							)
						);
					}
				},
				/**
				 * Validate: const myFunction = function() {} | Ignore: const myFunction = () => {}
				 */
				FunctionExpression: ({ parent }) => {
					if (!parent || !parent.loc) return;

					if (
						parent.type === "VariableDeclarator" &&
						parent.id.type === "Identifier" &&
						(!this.onlyCheckNewCode || changedLines?.has(parent.loc.start.line))
					) {
						diagnosticPromises.push(
							this.checkFunctionAndAddDiagnostic(
								parent.id.name,
								parent,
								document,
								diagnostics
							)
						);
					}
				},
				/**
				 * Validate: const myFunction = () => {} | Ignore: () => {}
				 */
				ArrowFunctionExpression: ({ parent }) => {
					if (!parent || !parent.loc) return;

					if (
						parent.type === "VariableDeclarator" &&
						parent.id.type === "Identifier" &&
						(!this.onlyCheckNewCode || changedLines?.has(parent.loc.start.line))
					) {
						diagnosticPromises.push(
							this.checkFunctionAndAddDiagnostic(
								parent.id.name,
								parent,
								document,
								diagnostics
							)
						);
					}
				},
			});
			await Promise.all(diagnosticPromises);
		} catch (error: any) {
			this.handleError(error);
		}
		return diagnostics;
	}

	private applyVariableDeclarationDiagnostics(
		declaration: any,
		diagnostics: any,
		document: any
	) {
		if (
			!declaration.id ||
			declaration.id.type !== "Identifier" ||
			!declaration.id.name
		) {
			return; // something is wrong with the declaration
		}
		const variableName = declaration.id.name;
		let variableValue = null;

		if (declaration.init?.type === "BooleanLiteral") {
			variableValue = declaration.init.value;
		}

		const conventionCheckResult = this.validateVariableName({
			variableName,
			variableValue,
		});

		if (conventionCheckResult.violates) {
			const start = document.positionAt(declaration.start);
			const end = document.positionAt(declaration.start + variableName.length);
			const range = Range.create(start, end);
			const diagnostic: Diagnostic = Diagnostic.create(
				range,
				conventionCheckResult.reason,
				DiagnosticSeverity.Warning,
				"namingConventionViolation",
				"whenInRome"
			);
			diagnostics.push(diagnostic);
		}
	}

	private async checkFunctionAndAddDiagnostic(
		name: string,
		node: any,
		document: TextDocument,
		diagnostics: Diagnostic[]
	) {
		const result = await this.validateFunctionName(name);
		if (result.violates) {
			if (!node.start || !node.end) return;

			const range = Range.create(
				document.positionAt(node.start),
				document.positionAt(node.start + name.length)
			);
			const diagnostic: Diagnostic = Diagnostic.create(
				range,
				result.reason,
				DiagnosticSeverity.Warning,
				"namingConventionViolation",
				"whenInRome"
			);
			diagnostics.push(diagnostic);
		}
	}

	private async validateFunctionName(functionName: string): Promise<{
		violates: boolean;
		reason: string;
	}> {
		return await validateJavaScriptAndTypeScriptFunctionNameCase(functionName);
	}
}
