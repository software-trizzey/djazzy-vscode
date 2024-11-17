import * as vscode from "vscode";

import Rollbar = require("rollbar");
import projectPackageJson from "../../package.json";
import { COMMANDS, DJANGOLY_ID } from './constants';

export const rollbar = new Rollbar({
	accessToken: "bb31966b163846dcbe5e5d74f30fd9ad",
	environment: process.env.NODE_ENV === "development" ? "development" : "production",
	captureUncaught: true,
	captureUnhandledRejections: true,
	version: projectPackageJson.version,
	checkIgnore: (isUncaught, args, item: any) => {
		if (item.custom && item.custom.vscode && item.custom.vscode.extension) {
            if (item.custom.vscode.extension !== DJANGOLY_ID) {
                console.log(`Ignoring error from extension: ${item.custom.vscode.extension}`);
                return true;
            }
        }

		if (item.body.trace_chain && item.body.trace_chain.length > 0) {
			const exception = item.body.trace_chain[0].exception;
			if (exception && exception.message === "Canceled") {
				console.log("Ignoring Canceled: Canceled error", exception);
				return true;
			}
		}
		return false; // Let all other errors through
	},
});

const logger = process.env.NODE_ENV === "development" ? console : rollbar;


export function trackUserInterestInCustomRules(userId: string) {
	const message = `User ${userId} is interested automated rules setup.`;
	rollbar.info(message);
}

export function trackActivation(context: vscode.ExtensionContext) {
	console.log("Tracking activation");
	try {
		const apiKey = context.globalState.get(COMMANDS.USER_API_KEY);

		rollbar.log('Extension activated', {
			userId: apiKey || "unknown",
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
		const apiKey = context.globalState.get(COMMANDS.USER_API_KEY);

		rollbar.log('Extension deactivated', {
			userId: apiKey || "unknown",
			version: context.extension.packageJSON.version,
			environment: rollbar.options.environment,
		});
	} catch (error) {
		rollbar.error("Failed to track deactivation", error);
	}
}

export function trackFeatureUsage(userId: string, featureName: string) {
	const message = `User ${userId} used feature ${featureName}`;
	logger.info(message);
}

export function trackExceptionHandlingResultFeedback(userId: string, feedback: string) {
	const message = `User ${userId} provided feedback for exception handling suggestion: ${feedback}`;
	logger.info(message);
}

export default logger;
