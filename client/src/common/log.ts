import * as vscode from "vscode";

import { EXTENSION_DISPLAY_NAME } from "../../../shared/constants";

export const outputChannel = vscode.window.createOutputChannel(EXTENSION_DISPLAY_NAME);

function getCurrentTime() {
	const now = new Date();
	return now.toLocaleTimeString();
}

class Logger {
	constructor(private readonly outputChannel: vscode.OutputChannel) {}

	getOutputChannel() {
		return this.outputChannel;
	}

	info(message: string) {
		this.outputChannel.appendLine(`CLIENT: ${getCurrentTime()} [INFO] ${message}`);
	}

	error(message: string) {
		this.outputChannel.appendLine(`CLIENT: ${getCurrentTime()} [ERROR] ${message}`);
	}

	warn(message: string) {
		this.outputChannel.appendLine(`CLIENT: ${getCurrentTime()} [WARN] ${message}`);
	}

	debug(message: string) {
		this.outputChannel.appendLine(`CLIENT: ${getCurrentTime()} [DEBUG] ${message}`);
	}
}


export const logger = new Logger(outputChannel);