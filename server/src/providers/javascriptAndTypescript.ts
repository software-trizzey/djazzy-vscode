import {
	Connection,
	CodeAction,
	CodeActionKind,
	Command,
	Diagnostic,
	DiagnosticSeverity,
	Range,
	TextEdit,
	WorkspaceEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import * as babelParser from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";

import { LanguageProvider } from "./base";

import {
	debounce,
	validateJavaScriptAndTypeScriptFunctionNameCase,
} from "../utils";

import { ExtensionSettings, defaultConventions } from "../settings";
import { SOURCE_NAME } from "../constants/names";

export class JavascriptAndTypescriptProvider extends LanguageProvider {
	private isTypeScript: boolean = false;
	private codeActionsMessageCache: Map<string, CodeAction> = new Map();

	provideDiagnosticsDebounced: (document: TextDocument) => void;

	private async triggerDiagnostics(document: TextDocument) {
		await this.provideDiagnostics(document);
	}

	constructor(
		languageId: keyof typeof defaultConventions.languages,
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

		if (cachedAction) {
			return cachedAction;
		}

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
			if (this.settings.isDevMode) {
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
		const textEdit = TextEdit.replace(range, suggestedName);
		const workspaceEdit: WorkspaceEdit = {
			changes: {
				[document.uri]: [textEdit],
			},
		};
		const fix = CodeAction.create(
			title,
			workspaceEdit,
			CodeActionKind.QuickFix
		);
		fix.diagnostics = [diagnostic];
		fix.isPreferred = true;
		this.codeActionsMessageCache.set(cacheKey, fix);
		return fix;
	}

	public async runDiagnostics(
		document: TextDocument,
		diagnostics: Diagnostic[],
		changedLines: Set<number> | undefined
	): Promise<Diagnostic[]> {
		const diagnosticPromises: Promise<void>[] = [];

		try {
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
				attachComment: true,
				errorRecovery: true,
			});
			traverse(ast, {
				enter: (path) => {
					if (
						this.settings.comments.flagRedundant &&
						path.node.leadingComments
					) {
						path.node.leadingComments.forEach((comment) => {
							if (!this.isTodoOrFixme(comment.value)) {
								this.handleComment(comment, path, document, diagnostics);
							}
						});
					}
				},
				VariableDeclaration: ({ node }) => {
					node.declarations.forEach((declaration) => {
						if (
							declaration.loc &&
							(!this.settings.onlyCheckNewCode ||
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
						!this.settings.onlyCheckNewCode ||
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
						(!this.settings.onlyCheckNewCode ||
							changedLines?.has(parent.loc.start.line))
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
						(!this.settings.onlyCheckNewCode ||
							changedLines?.has(parent.loc.start.line))
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
				SOURCE_NAME
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
				SOURCE_NAME
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

	private handleComment(
		comment: any,
		path: NodePath,
		document: TextDocument,
		diagnostics: Diagnostic[]
	) {
		const commentText = comment.value;
		const currentNode = path.node;

		if (!commentText || !currentNode || !currentNode.leadingComments) return;

		const result = this.isCommentRedundant(commentText, currentNode);
		if (result.violates) {
			const start = document.positionAt(comment.start);
			const end = document.positionAt(comment.end);
			diagnostics.push(
				Diagnostic.create(
					Range.create(start, end),
					result.reason,
					DiagnosticSeverity.Warning,
					undefined,
					SOURCE_NAME
				)
			);
		}
	}
}
