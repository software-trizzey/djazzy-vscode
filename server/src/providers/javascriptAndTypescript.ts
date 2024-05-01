import {
	Connection,
	CodeAction,
	CodeActionKind,
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

		const fix = CodeAction.create(
			`Rename to '${suggestedName}'`,
			CodeActionKind.QuickFix
		);
		// TODO: Implement WorkspaceEdit
		// fix.edit = WorkspaceEdit;
		// fix.edit.replace(document.uri, diagnostic.range, suggestedName);
		fix.isPreferred = true;
		this.codeActionsMessageCache.set(cacheKey, fix);
		return fix;
	}

	public async provideDiagnostics(
		document: TextDocument
	): Promise<Diagnostic[] | undefined> {
		if (this.languageId === "javascript" && !this.isEnabled) return;
		if (this.languageId === "typescript" && !this.isEnabled) return;

		this.diagnostics.delete(document.uri);

		const currentId = ++this.cancellationId;
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
					return;
				}
			}

			const text = document.getText();
			const pluginOptions: babelParser.ParserPlugin[] = [];
			if (this.isTypeScript) {
				pluginOptions.push("typescript");
			}

			const ast = babelParser.parse(text, {
				sourceType: "module",
				plugins: pluginOptions,
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
			// If there is a newer request, ignore this one
			if (currentId === this.cancellationId) {
				this.diagnostics.set(document.uri, diagnostics);
			}
			return diagnostics;
		} catch (error: any) {
			this.handleError(error);
		}
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

		if (declaration.init.type === "BooleanLiteral") {
			variableValue = declaration.init.value;
		}

		const conventionCheckResult = this.validateVariableName({
			variableName,
			variableValue,
			languageId: this.languageId,
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
