import {
	Connection,
	CodeAction,
	CodeActionKind,
	Diagnostic,
	DiagnosticSeverity,
	Range,
	TextEdit,
	WorkspaceEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import * as babelParser from "@babel/parser";
import { ObjectProperty } from "@babel/types";
import traverse, { NodePath } from "@babel/traverse";

import { LanguageProvider } from "./base";

import {
	debounce,
	validateJavaScriptAndTypeScriptFunctionName,
} from "../utils";

import { ExtensionSettings, defaultConventions } from "../settings";
import { SOURCE_NAME, NAMING_CONVENTION_VIOLATION_SOURCE_TYPE, THEME_SYSTEM_VIOLATION_SOURCE_TYPE, RENAME_SUGGESTION_PLACEHOLDER } from "../constants/diagnostics";
import { RULE_MESSAGES } from '../constants/rules';
import { LanguageConventions } from "../languageConventions";

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

		if (languageId === "typescript" || languageId === "typescriptreact") {
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
		diagnostic: Diagnostic,
		userToken: string
	): Promise<CodeAction | undefined> {
		const flaggedName = document.getText(diagnostic.range);
		const violationMessage = diagnostic.message;
		const cacheKey = `${violationMessage}-${diagnostic.range.start.line}-${diagnostic.range.start.character}`;
		const cachedAction = this.codeActionsMessageCache.get(cacheKey);
		let suggestedName = "";
	
		if (cachedAction) {
			return cachedAction;
		}

		if (violationMessage.includes(RULE_MESSAGES.VARIABLE_TOO_SHORT.replace("{name}", flaggedName))) {
			suggestedName = RENAME_SUGGESTION_PLACEHOLDER;
		} else if (violationMessage.includes(RULE_MESSAGES.BOOLEAN_NEGATIVE_PATTERN.replace("{name}", flaggedName))) {
			suggestedName = flaggedName.replace(/not/i, "");
		} else if (violationMessage.includes(RULE_MESSAGES.BOOLEAN_NO_PREFIX.replace("{name}", flaggedName))) {
			const capitalizedName = flaggedName.charAt(0).toUpperCase() + flaggedName.slice(1);
			suggestedName = `is${capitalizedName}`;
		} else if (violationMessage.includes(RULE_MESSAGES.FUNCTION_NO_ACTION_WORD.replace("{name}", flaggedName)) ||
				violationMessage.includes(RULE_MESSAGES.FUNCTION_TOO_SHORT.replace("{name}", flaggedName))) {
			if (this.settings.general.isDevMode) {
				suggestedName = `get${flaggedName}`;
			} else {
				suggestedName = RENAME_SUGGESTION_PLACEHOLDER;
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
		const fix = CodeAction.create(title, workspaceEdit, CodeActionKind.QuickFix);
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
				"jsx",
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
							(!this.settings.general.onlyCheckNewCode ||
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
						!this.settings.general.onlyCheckNewCode ||
						changedLines?.has(node.loc.start.line)
					) {
						diagnosticPromises.push(
							this.checkFunctionAndAddDiagnostic(
								node.id.name,
								node,
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
						(!this.settings.general.onlyCheckNewCode ||
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
						(!this.settings.general.onlyCheckNewCode ||
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
				ObjectExpression: ({ node }) => {
					node.properties.forEach((property) => {
						if (property.type === "ObjectProperty" && property.key.type === "Identifier") {
							if (
								property.loc &&
								(!this.settings.general.onlyCheckNewCode ||
									changedLines?.has(property.loc.start.line))
							) {
								this.applyObjectPropertyDiagnostics(
									property,
									diagnostics,
									document
								);
							}
						}
					});
				},
			});
			await Promise.all(diagnosticPromises);
		} catch (error: any) {
			if (
				error.code === "BABEL_PARSE_ERROR" ||
				error.code === "BABEL_PARSER_SYNTAX_ERROR" ||
				error.stack.includes("SyntaxError")
			) {
				// @rome-ignore: we're not concerned with syntax errors as they're likely triggered by incomplete code
				console.log("Runtime error detected", error);
			} else {
			this.handleError(error);
			}
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
				NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
				SOURCE_NAME
			);
			diagnostics.push(diagnostic);
		}

		if (declaration.init?.type === "Literal" || declaration.init?.type === "TemplateLiteral") {
			const code = document.getText(Range.create(
				document.positionAt(declaration.init.start),
				document.positionAt(declaration.init.end)
			));
			const themeViolations = this.validateThemeSystemUsage(code);
			themeViolations.forEach(violation => {
				const violationRange = Range.create(
					document.positionAt(declaration.init.start + violation.index),
					document.positionAt(declaration.init.start + violation.index + violation.value.length)
				);
				const diagnostic: Diagnostic = Diagnostic.create(
					violationRange,
					violation.reason,
					DiagnosticSeverity.Warning,
					THEME_SYSTEM_VIOLATION_SOURCE_TYPE,
					SOURCE_NAME
				);
				diagnostics.push(diagnostic);
			});
		}
	}

	private applyObjectPropertyDiagnostics(
		property: ObjectProperty,
		diagnostics: Diagnostic[],
		document: TextDocument
	) {
		if (
			property.key &&
			property.key.type === "Identifier" &&
			property.key.start  &&
			property.key.end 
		) {
			const objectKey = property.key.name;
			const objectValue = property.value;
			const validationResult = this.validateObjectPropertyName({
				objectKey,
				objectValue,
			});

			if (validationResult.violates) {
				const propertyRange = Range.create(
					document.positionAt(property.key.start),
					document.positionAt(property.key.end)
				);
				const diagnostic: Diagnostic = {
					range: propertyRange,
					severity: DiagnosticSeverity.Warning,
					message: validationResult.reason,
					code: NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
					source: SOURCE_NAME,
				};
				diagnostics.push(diagnostic);
			}

			const objectPropertyStartValue = property.value.start;
			const objectPropertyEndValue = property.value.end;

			if (objectPropertyStartValue && objectPropertyEndValue) {
				
				const objectValueCode = document.getText(Range.create(
					document.positionAt(objectPropertyStartValue),
					document.positionAt(objectPropertyEndValue)
				));
				const themeViolations = this.validateThemeSystemUsage(objectValueCode);
				themeViolations.forEach(violation => {
					const violationRange = Range.create(
						document.positionAt(objectPropertyStartValue + violation.index),
						document.positionAt(objectPropertyStartValue + violation.index + violation.value.length)
					);
					const diagnostic: Diagnostic = {
						range: violationRange,
						severity: DiagnosticSeverity.Warning,
						message: violation.reason,
						code: THEME_SYSTEM_VIOLATION_SOURCE_TYPE,
						source: SOURCE_NAME,
					};
					diagnostics.push(diagnostic);
				});
			}
		} else {
			console.log("Property key is not an Identifier", property);
		}
	}	

	private async checkFunctionAndAddDiagnostic(
		name: string,
		node: any,
		document: TextDocument,
		diagnostics: Diagnostic[]
	) {
		if (
			!node.body ||
			!node.body.loc ||
			!node.body.loc.start ||
			!node.body.loc.end
		) {
			console.warn("node has no body property", node);
			return;
		}

		const conventions = this.getConventions();
		const bodyStartLine = node.body.loc.start.line;
		const bodyEndLine = node.body.loc.end.line;
		const functionBodyLines = bodyEndLine - bodyStartLine + 1;

		const result = await this.validateFunctionName(
			name,
			functionBodyLines,
			conventions
		);

		if (result.violates) {
			if (!node.id.start || !node.id.end) return;

			const diagnosticRange = Range.create(
				document.positionAt(node.id.start),
				document.positionAt(node.id.start + name.length)
			);
			const diagnostic: Diagnostic = Diagnostic.create(
				diagnosticRange,
				result.reason,
				DiagnosticSeverity.Warning,
				NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
				SOURCE_NAME
			);
			diagnostics.push(diagnostic);
		}
	}

	private async validateFunctionName(
		functionName: string,
		functionBodyLines: number,
		languageConventions: LanguageConventions
	): Promise<{
		violates: boolean;
		reason: string;
	}> {
		return await validateJavaScriptAndTypeScriptFunctionName(
			functionName,
			functionBodyLines,
			languageConventions
		);
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
