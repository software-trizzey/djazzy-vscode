import * as vscode from "vscode";

import Rollbar = require("rollbar");

export const rollbar = new Rollbar({
	accessToken: "bb31966b163846dcbe5e5d74f30fd9ad",
	environment: process.env.NODE_ENV || "development",
	captureUncaught: true,
	captureUnhandledRejections: true,
});

const logger = process.env.NODE_ENV === "development" ? console : rollbar;


export function trackUserInterestInCustomRules(userId: string) {
	const message = `User ${userId} is interested automated rules setup.`;
	rollbar.info(message);
}

export function trackActivation(context: vscode.ExtensionContext) {
	console.log("Tracking activation");
	try {
		rollbar.log('Extension activated', {
			userId: vscode.env.machineId,
			version: context.extension.packageJSON.version,
			environment: rollbar.options.environment,
		});

		rollbar.info('Activation metadata', {
			isFirstActivation: !context.globalState.get("hasActivatedOnce"),
		});

		// Mark the extension as activated once for the first time
		if (!context.globalState.get("hasActivatedOnce")) {
			context.globalState.update("hasActivatedOnce", true);
		}
	} catch (error) {
		rollbar.error("Failed to track activation", error);
	}
}

export function trackDeactivation(context: vscode.ExtensionContext) {
	console.log("Tracking deactivation");
	try {
		rollbar.log('Extension deactivated', {
			userId: vscode.env.machineId,
			version: context.extension.packageJSON.version,
			environment: rollbar.options.environment,
		});
	} catch (error) {
		rollbar.error("Failed to track deactivation", error);
	}
}

export default logger;
