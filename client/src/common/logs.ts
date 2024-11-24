import * as vscode from "vscode";

import Rollbar = require("rollbar");
import projectPackageJson from "../../package.json";
import { COMMANDS, DJANGOLY_ID, API_SERVER_URL } from './constants';

const isDevelopment = process.env.NODE_ENV === "development";

export const rollbar = new Rollbar({
	accessToken: "bb31966b163846dcbe5e5d74f30fd9ad",
	environment: isDevelopment ? "development" : "production",
	captureUncaught: false,
	captureUnhandledRejections: false,
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

/**
 * VSCode doesn't provide a way to track extension installations,
 * so we use this function to track the first activation of the extension.
 */
export async function trackUserInstallEvent(context: vscode.ExtensionContext) {
    try {
        const apiKey = context.globalState.get(COMMANDS.USER_API_KEY);
        const isFirstActivation = !context.globalState.get("isInitialized") && apiKey;
		console.log("Detected extension installation");

        if (isFirstActivation) {
			const payload = {
                user_id: apiKey,
                created_at: new Date().toISOString(),
                extension_version: context.extension.packageJSON.version,
            };

			const response = await fetch(`${API_SERVER_URL}/auth/activate/`, {
				method: 'POST',
				body: JSON.stringify(payload),
				headers: {
					'Content-Type': 'application/json',
				},
			});

			if (!response.ok) {
				const data = await response.json();
				console.error("Failed to activate user", data);
				throw new Error("Failed to activate user");
			}

            rollbar.log('Extension activated for the first time', {
                userId: apiKey,
                version: context.extension.packageJSON.version,
                environment: rollbar.options.environment,
            });

            await context.globalState.update("isInitialized", true);
        }

        if (!context.globalState.get("hasActivatedOnce")) {
            await context.globalState.update("hasActivatedOnce", true);
        }
    } catch (error) {
        rollbar.error("Failed to track activation", error);
    }
}


/**
 * VSCode doesn't provide a way to track uninstall events. This function is
 * our attempt to track uninstall events.
 */
export async function trackUninstallEvent(context: vscode.ExtensionContext) {
	if (!context) {
		console.error("trackUninstallEvent: context is undefined");
		return;
	}

	console.log("Detected uninstall event");
    try {
        const apiKey = context.globalState.get(COMMANDS.USER_API_KEY);
        const isInitialized = context.globalState.get("isInitialized");

        if (apiKey && isInitialized) {
            const payload = {
                user_id: apiKey,
                created_at: new Date().toISOString(),
                extension_version: context.extension.packageJSON.version,
            };

            try {
                await fetch(`${API_SERVER_URL}/auth/deactivate/`, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            } catch (error) {
                rollbar.error("Failed to deactivate user", error);
            }

			if (!isDevelopment) {
				rollbar.log('Extension deactivated', {
					userId: payload.user_id,
					version: payload.extension_version,
					created_at: payload.created_at,
					environment: rollbar.options.environment,
				});
			}
        }
    } catch (error) {
        if (!isDevelopment) {
			rollbar.error("Failed to track deactivation", error);
        } else {
			console.error("Failed to track deactivation", error);
        }
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
