import * as path from 'path';

import { spawn } from 'child_process';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { pythonExecutable } from '../settings';
import LOGGER from '../common/logs';


interface FunctionBodyNode {
	absolute_line_number: number;
	content: string;
	end_col: number;
	relative_line_number: number;
	start_col: number;
}

export interface FunctionCallSite {
	line: number;
	col: number;
}

export interface FunctionDetails {
    name: string;
    args: string[];
    returns: string | null;
    body: FunctionBodyNode[];
	raw_body: string;
    decorators: string[];
	context: {
		start: number;
		end: number;
		start_col: number;
		end_col: number;
		imports: string[];
		call_sites: FunctionCallSite[];
	}
}

export function findFunctionNode(
	document: TextDocument,
	functionName: string,
	lineNumber: number
): Promise<FunctionDetails> | null {
	try {
		const text = document.getText();
		const parserFilePath = getPythonParserFilePath();
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
		const message = error?.message || error.toString();
		if (
			!message.includes("SyntaxError") ||
			!message.includes("IndentationError") ||
			!message.includes("Unexpected token")
		) {
			console.log(error);
			LOGGER.error(error);
		}
		return null;
	}
}



export function getPythonParserFilePath(): string {
	const basePath = process.env.PYTHON_TOOLS_PATH || path.resolve(
		__dirname, '..', 'bundled', 'tools', 'python'
	);
	const parserFilePath = path.join(basePath, 'get_function_details.py');

	console.log(`Resolved parser file path: ${parserFilePath}`);

	return parserFilePath;
}