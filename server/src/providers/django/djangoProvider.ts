import { spawn } from 'child_process';
import path from 'path';

import {
    Diagnostic,
    DiagnosticSeverity,
    Range,
    Connection,
	CodeAction,
	CodeActionKind,
    Command,
    Position,
} from "vscode-languageserver/node";
import { TextDocument } from 'vscode-languageserver-textdocument';

import {
	NAMING_CONVENTION_VIOLATION_SOURCE_TYPE,
} from "../../constants/diagnostics";
import { ExtensionSettings, pythonExecutable } from "../../settings";
import LOGGER from '../../common/logs';
import {
    NPLUSONE_FEEDBACK 
} from '../../constants/commands';
import { Severity } from '../../llm/types';

import { RuleCodes } from '../../constants/rules';
import { debounce } from '../../utils';
import { LanguageProvider } from '../languageProvider';

interface ParsedDiagnosticsSchema {
    diagnostics: Diagnostic[];
    diagnostics_count: number;
}

export class DjangoProvider extends LanguageProvider {

    provideDiagnosticsDebounced: (document: TextDocument) => void;

    constructor(
        connection: Connection,
        settings: ExtensionSettings,
        document: TextDocument
    ) {
        super(connection, settings, document);


        const timeoutInMilliseconds = 1000;
		this.provideDiagnosticsDebounced = debounce(
			(document) => this.provideDiagnostics(document),
			timeoutInMilliseconds
		);
    }

	public getStoredSettings(): ExtensionSettings {
		return this.settings;
	}

	public updateSettings(settings: ExtensionSettings): void {
		this.settings = settings;
	}

    public async provideDiagnostics(
		document: TextDocument,
        isOnSave: boolean = false
	): Promise<Diagnostic[]> {
		this.diagnosticsManager.deleteDiagnostic(document.uri);

		let diagnostics: Diagnostic[] = [];

		diagnostics = await this.runDiagnostics(
			document,
			diagnostics,
		);

		this.diagnosticsManager.setDiagnostic(document.uri, document.version, diagnostics);
		return diagnostics;
	}

	public async runDiagnostics(
		document: TextDocument,
		diagnostics: Diagnostic[],
	): Promise<Diagnostic[]> {
		try {
			const text = document.getText();
			const parserFilePath = this.getParserFilePath();
			const settings = await this.getStoredSettings();
	
			return new Promise((resolve, reject) => {
				const process = spawn(pythonExecutable, [parserFilePath, document.uri, JSON.stringify(settings)]);
				let output = "";
				let error = "";
	
				process.stdout.on("data", (data) => {
					output += data.toString();
				});
				process.stderr.on("data", (data) => {
					error += data.toString();
					console.log(`[PARSER] ${data}`); 
				});
	
				process.on("close", async (code) => {
					if (code !== 0) {
						const errorMessage = `Process exited with code ${code}, stderr: ${error}`;
						console.error(errorMessage);
						return reject(new Error(errorMessage));
					}
	
					try {
						const jsonLines = output
							.split("\n")
							.filter(
								(line) =>
									line.trim().startsWith("[") || line.trim().startsWith("{")
							);
						const jsonString = jsonLines.join("\n");
						const results: ParsedDiagnosticsSchema = JSON.parse(jsonString);
                        const parsedDiagnostics = results.diagnostics || [];
						
						if (results.diagnostics_count === 0) return resolve([]);

                        parsedDiagnostics.forEach((diagnostic: any) => {
                            const mappedSeverity = this.mapSeverity(diagnostic.severity);
                            this.addDiagnostic(
                                diagnostics,
                                diagnostic,
                                diagnostic.message,
                                mappedSeverity,
                                diagnostic.issue_code
                            );
                        });
						resolve(diagnostics);
					} catch (err: any) {
						console.error("Failed to parse JSON output:", err, output);
						reject(new Error(`Failed to parse JSON output: ${err.message}`));
					}
				});
	
				if (process.stdin) {
					process.stdin.write(text);
					process.stdin.end();
				}
			});
		} catch (error: any) {
			if (error instanceof SyntaxError) {
				console.warn("Syntax error detected. Skipping invalid sections and continuing...");
				this.errorHandler.handleError(error);
				return diagnostics;
			} else {
				this.errorHandler.handleError(error);
				return [];
			}
		}
	}	

	private getParserFilePath(filename: string = 'run_check.py'): string {
        const basePath = process.env.PYTHON_TOOLS_PATH || path.resolve(
            __dirname, '..', 'bundled', 'tools', 'python'
        );
        const parserFilePath = path.join(basePath, filename);

        console.log(`Resolved parser file path: ${parserFilePath}`);
    
        return parserFilePath;
    }

    public async provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]> {
        const diagnostics = document.uri
            ? this.diagnosticsManager.getDiagnostic(document.uri, document.version)
            : [];
    
        if (!diagnostics) return [];
    
        const codeActions: CodeAction[] = [];
        
        for (const diagnostic of diagnostics) {
            if (diagnostic.code === RuleCodes.NPLUSONE) {
                const feedbackAction = CodeAction.create(
                    `Provide feedback: ${diagnostic.message}`,
                    Command.create(
                        'Provide feedback',
                        NPLUSONE_FEEDBACK,
                        document.uri,
                        diagnostic
                    ),
                    CodeActionKind.QuickFix
                );
                feedbackAction.diagnostics = [diagnostic];
                feedbackAction.isPreferred = true;
    
                codeActions.push(feedbackAction);
            }
        }
    
        const filteredActions = codeActions.filter(action => action !== undefined);
        return filteredActions;
    }

	private addDiagnostic(
		diagnostics: Diagnostic[],
		symbol: any,
		message: string,
		severity: DiagnosticSeverity = DiagnosticSeverity.Warning,
		sourceType: string = NAMING_CONVENTION_VIOLATION_SOURCE_TYPE
	): void {
		const line = symbol.line - 1;
		const start = symbol.col_offset;
		const end = symbol.full_line_length;
		const range = Range.create(
			Position.create(line, start),
			Position.create(line, end)
		);
		
		if (!message) {
			console.error("Diagnostic message is empty. Skipping creation.", {
				symbol,
				timestamp: new Date().toISOString()
			});
			return;
		}
		const diagnostic = this.diagnosticsManager.createDiagnostic(range, message, severity, sourceType);
		diagnostics.push(diagnostic);
	}

    private mapSeverity(severity: Severity): DiagnosticSeverity {
        switch (severity) {
            case Severity.ERROR:
                return DiagnosticSeverity.Error;
            case Severity.WARNING:
                return DiagnosticSeverity.Warning;
            case Severity.INFORMATION:
                return DiagnosticSeverity.Information;
            case Severity.HINT:
                return DiagnosticSeverity.Hint;
            default:
                return DiagnosticSeverity.Hint;
        }
    }

	public logFalsePositiveFeedback(diagnosticId: string): void {
		LOGGER.info(`False positive reported`, {
			userId: "anonymous",
			diagnosticId: diagnosticId,
			timestamp: new Date().toISOString()
		});
	}  
}