import * as vscode from "vscode";
import * as babelParser from "@babel/parser";
import traverse from "@babel/traverse";

import { LanguageProvider } from "./base";
import defaultConventions from "../defaultConventions";

import {
	debounce,
	validateJavaScriptAndTypeScriptFunctionNameCase,
} from "../utils";

export class ReactProvider extends LanguageProvider {
	isTypeScript: boolean = false;

	provideDiagnosticsDebounced: (document: vscode.TextDocument) => void;

	private async triggerDiagnostics(document: vscode.TextDocument) {
		await this.provideDiagnostics(document);
	}

	constructor(languageId: keyof typeof defaultConventions) {
		super(languageId);

		if (languageId === "typescriptreact") {
			this.isTypeScript = true;
		}

		const timeoutInMilliseconds = 1000;
		this.provideDiagnosticsDebounced = debounce(
			(document) => this.triggerDiagnostics(document),
			timeoutInMilliseconds
		);
	}

	provideCodeActions(
		document: vscode.TextDocument
	): Promise<vscode.CodeAction[]> {
		const diagnostics = vscode.languages.getDiagnostics(document.uri);

		const namingConventionDiagnostics = diagnostics.filter(
			(diagnostic) => diagnostic.code === "namingConventionViolation"
		);

		const actionPromises = namingConventionDiagnostics.map((diagnostic) =>
			this.generateFixForNamingConventionViolation(document, diagnostic)
		);

		return Promise.all(actionPromises);
	}

	async generateFixForNamingConventionViolation(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic
	): Promise<vscode.CodeAction> {
		const range = diagnostic.range;
		const fix = new vscode.CodeAction(
			`Rename variable to match conventions`,
			vscode.CodeActionKind.QuickFix
		);
		fix.edit = new vscode.WorkspaceEdit();

		// Here, you would calculate the new name based on your conventions
		// For demonstration, let's just append 'Corrected' to the existing name
		const varName = document.getText(range);
		const correctedName = `${varName}Corrected`;

		fix.edit.replace(document.uri, range, correctedName);

		return fix;
	}

	public async provideDiagnostics(
		document: vscode.TextDocument
	): Promise<void> {
		const currentId = ++this.cancellationId;
		const text = document.getText();
		const diagnostics: vscode.Diagnostic[] = [];
		const diagnosticPromises: Promise<void>[] = [];

		this.diagnostics.delete(document.uri);

		const pluginOptions: babelParser.ParserPlugin[] = ["jsx"];
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
					if (declaration.id.type === "Identifier") {
						const variableName = declaration.id.name;
						let variableValue = null;

						if (declaration.init?.type === "BooleanLiteral") {
							variableValue = declaration.init.value;
						}

						const conventionCheckResult = this.validateVariableName({
							variableName,
							variableValue,
							languageId: this.languageId,
						});

						if (conventionCheckResult.violates) {
							if (!declaration.start || !declaration.end) return;

							const start = document.positionAt(declaration.start);
							const end = document.positionAt(declaration.end);
							const range = new vscode.Range(start, end);
							diagnostics.push(
								new vscode.Diagnostic(
									range,
									conventionCheckResult.reason,
									vscode.DiagnosticSeverity.Warning
								)
							);
						}
					}
				});
			},
			/**
			 * Validate: function myFunction() {} | Ignore: function() {}
			 */
			FunctionDeclaration: (path) => {
				console.log(path);
				const { node } = path;
				if (node.id && node.id.type === "Identifier") {
					const functionName = node.id.name;
					const returnsJSX = this.isReactComponent(path);

					if (/^[A-Z]/.test(functionName) && returnsJSX) {
						console.log(`${functionName} is likely a React component.`);
						// TODO: Add diagnostics for React components
					} else if (/^[a-z]/.test(functionName)) {
						console.log(`${functionName} is likely a regular function.`);
						diagnosticPromises.push(
							this.checkFunctionAndAddDiagnostic(
								node.id.name,
								node.id,
								document,
								diagnostics
							)
						);
					}
				}
			},
			/**
			 * Validate: function myFunction() {} | Ignore: function() {}
			 */
			FunctionExpression: ({ parent }) => {
				if (
					parent &&
					parent.type === "VariableDeclarator" &&
					parent.id.type === "Identifier"
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
				if (
					parent &&
					parent.type === "VariableDeclarator" &&
					parent.id.type === "Identifier"
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
			console.log("updating diagnostics");
			this.diagnostics.set(document.uri, diagnostics);
		}
	}

	private isReactComponent(node: any) {
		let returnsJSX = false;

		node.traverse({
			ReturnStatement(returnPath: any) {
				const { argument } = returnPath.node;
				if (argument) {
					if (argument.type === "JSXElement") {
						returnsJSX = true;
					} else if (
						argument.type === "CallExpression" &&
						argument.callee.type === "MemberExpression" &&
						argument.callee.object.type === "Identifier" &&
						argument.callee.object.name === "React" &&
						argument.callee.property.type === "Identifier" &&
						argument.callee.property.name === "createElement"
					) {
						returnsJSX = true;
					}
				}
			},
		});
		return returnsJSX;
	}

	private async checkFunctionAndAddDiagnostic(
		name: string,
		node: any,
		document: vscode.TextDocument,
		diagnostics: vscode.Diagnostic[]
	) {
		const result = await this.validateFunctionName(name);
		if (result.violates) {
			if (!node.start || !node.end) return;
			const range = new vscode.Range(
				document.positionAt(node.start),
				document.positionAt(node.end)
			);
			diagnostics.push(
				new vscode.Diagnostic(
					range,
					result.reason,
					vscode.DiagnosticSeverity.Warning
				)
			);
		}
	}

	private async validateFunctionName(functionName: string): Promise<{
		violates: boolean;
		reason: string;
	}> {
		return await validateJavaScriptAndTypeScriptFunctionNameCase(functionName);
	}
}
