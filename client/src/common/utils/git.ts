import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";

import * as vscode from "vscode";

export async function getChangedLines(
	originalFilePath: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		const uri = vscode.Uri.parse(originalFilePath);
		const filePath = uri.fsPath;
		const relativeFilePath = path.relative(vscode.workspace.rootPath, filePath);
		exec(
			`git ls-files --others --exclude-standard ${relativeFilePath}`,
			{ cwd: vscode.workspace.rootPath },
			(error, stdout, stderr) => {
				if (error) {
					console.error("Error checking file status:", stderr);
					reject(`Error checking file status: ${stderr}`);
					return;
				}

				if (stdout.trim()) {
					// File is untracked, so consider all lines as changed
					const allLinesChanged = new Set<number>();
					const data = fs.readFileSync(
						path.join(vscode.workspace.rootPath, relativeFilePath),
						"utf8"
					);
					const lines = data.split("\n");
					for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
						allLinesChanged.add(lineIndex + 1); // Line numbers are 1-based
					}
					const serializedLineData = JSON.stringify(
						Array.from(allLinesChanged)
					);
					resolve(serializedLineData);
				} else {
					// File is tracked, use git diff to find changed lines
					exec(
						`git diff HEAD -U0 -- ${relativeFilePath}`,
						{ cwd: vscode.workspace.rootPath },
						(diffError, diffStdout, diffStderr) => {
							if (diffError) {
								console.error("Error getting git diff:", diffStderr);
								reject(`Error fetching changes: ${diffStderr}`);
								return;
							}
							const serializedLineData = JSON.stringify(
								Array.from(parseDiff(diffStdout))
							);
							resolve(serializedLineData);
						}
					);
				}
			}
		);
	});
}

/**
 * Parse the diff output to get the changed lines in the file.
 */
function parseDiff(diffOutput: string): Set<number> {
	const changedLines = new Set<number>();
	const regex = /^\+\+\+ b\/.*\n@@ -\d+,\d+ \+(\d+),(\d+) @@/gm;
	let match;

	while ((match = regex.exec(diffOutput)) !== null) {
		const startLine = parseInt(match[1], 10);
		const lineCount = parseInt(match[2], 10);

		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			changedLines.add(startLine + lineIndex);
		}
	}

	return changedLines;
}

export function createGitRepository() {
	const terminal = vscode.window.createTerminal({
		name: "Initialize Git Repository",
	});
	terminal.show();
	terminal.sendText("git init");
	terminal.sendText("echo # Initialize repository > README.md");
	terminal.sendText("git add README.md");
	terminal.sendText("git commit -m 'Initial commit'");
	terminal.sendText("echo .gitignore");
	terminal.sendText("echo node_modules > .gitignore");
}
