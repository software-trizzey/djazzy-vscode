import { exec } from "child_process";
import { workspace, window } from "vscode";

export function getChangedLines(filePath: string): Promise<Set<number>> | null {
	return new Promise((resolve, reject) => {
		exec(
			`git diff HEAD -U0 -- ${filePath}`,
			{ cwd: workspace.rootPath },
			(error: any, stdout: any, stderr: any) => {
				if (error) {
					console.error("Error getting git diff:", stderr);
					reject(`Error fetching changes: ${stderr}`);
					return;
				}
				const changedLines = parseDiff(stdout);
				resolve(changedLines);
			}
		);
	});
}

export function createGitRepository() {
	const terminal = window.createTerminal({
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

/**
 * Parse the diff output to get the changed lines in the file.
 */
function parseDiff(diffOutput: string): Set<number> {
	const changedLines = new Set<number>();
	const regex = /^@@ -\d+,\d+ \+(\d+),(\d+) @@/gm;
	let match;

	while ((match = regex.exec(diffOutput)) !== null) {
		const startLine = parseInt(match[1], 10);
		const lineCount = parseInt(match[2], 10);

		// Add all lines in this chunk to the set of changed lines
		for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
			changedLines.add(startLine + lineIndex);
		}
	}

	return changedLines;
}
