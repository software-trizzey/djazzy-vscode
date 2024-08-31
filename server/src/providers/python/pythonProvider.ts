import path from 'path';
import { spawn } from 'child_process';

import { Diagnostic, CodeAction, Connection } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { LanguageConventions } from '../../languageConventions';
import { defaultConventions, ExtensionSettings, pythonExecutable } from '../../settings';
import { ErrorHandler } from '../../services/error';


interface FunctionBodyNode {
	absolute_line_number: number;
	content: string;
	end_col: number;
	relative_line_number: number;
	start_col: number;
}


export interface FunctionDetails {
    name: string;
    args: string[];
    returns: string | null;
    body: FunctionBodyNode[];
	raw_body: string;
    decorators: string[];
	context: {
		start: number,
		end: number,
		start_col: number,
		end_col: number,
	}
}


export class PythonProvider  {
	private errorHandler: ErrorHandler;

	constructor(
        languageId: keyof typeof defaultConventions.languages,
        connection: Connection,
        settings: ExtensionSettings,
        document: TextDocument
    ) {
		this.errorHandler = new ErrorHandler(connection);
    }

	provideDiagnostics(document: TextDocument): Promise<Diagnostic[]> {
		throw new Error('Method not implemented.');
	}

	public async findFunctionNode(
		document: TextDocument,
		functionName: string,
		lineNumber: number
	): Promise<FunctionDetails | null> {
		try {
			const text = document.getText();
			const parserFilePath = this.getParserFilePath();
			const lineNumberText = lineNumber.toString();
	
			return new Promise((resolve, reject) => {
				const process = spawn(pythonExecutable, [parserFilePath, functionName, lineNumberText], );
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
							.filter((line) => line.trim().startsWith("[") || line.trim().startsWith("{"));
						const jsonString = jsonLines.join("\n");
						const result = JSON.parse(jsonString);
						return resolve(result);
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
			this.errorHandler.handleError(error);
			return null;
		}
	}	

	private getParserFilePath(): string {
        const basePath = process.env.PYTHON_TOOLS_PATH || path.resolve(
            __dirname, '..', 'bundled', 'tools', 'python'
        );
        const parserFilePath = path.join(basePath, 'get_function_details.py');

        console.log(`Resolved parser file path: ${parserFilePath}`);
    
        return parserFilePath;
    }


	runDiagnostics(
		document: TextDocument,
		diagnostics: Diagnostic[],
		changedLines: Set<number> | undefined
	): Promise<Diagnostic[]> {
		throw new Error('Method not implemented.');
	}
	
	generateFixForNamingConventionViolation(
		document: TextDocument,
		diagnostic: Diagnostic,
		userToken: string): Promise<CodeAction | undefined> {
		throw new Error('Method not implemented.');
	}

	provideCodeActions(document: TextDocument, userToken: string): Promise<CodeAction[]> {
		throw new Error('Method not implemented.');
	}

	getConventions(): LanguageConventions {
		throw new Error('Method not implemented.');
	}

	updateSettings(settings: ExtensionSettings): void {
		throw new Error('Method not implemented.');
	}
}