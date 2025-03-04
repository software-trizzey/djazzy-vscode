import * as vscode from "vscode";
import { LanguageClient } from 'vscode-languageclient/node';

import { API_KEY_SIGNUP_URL, API_SERVER_URL, COMMANDS, TELEMETRY_EVENTS } from "../../../../shared/constants";
import { reporter } from '../../../../shared/telemetry';
import { AUTH_MESSAGES } from '../constants/messages';
import { GitHubAuthProvider, UserSession } from './github';
import { logger } from '../log';

export async function signOutUser(context: vscode.ExtensionContext) {
	const authProvider = new GitHubAuthProvider(context);
	logger.info("Signing out from Djazzy");
	await authProvider.signOut();
}


export async function validateApiKey(apiKey: string): Promise<UserSession | false> {
    try {
        const response = await fetch(`${API_SERVER_URL}/auth/validate-api-key/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ api_key: apiKey }),
        });

        if (!response.ok) {
            throw new Error(`Failed to validate API key: ${response.statusText}`);
        }

        const userSession: UserSession = await response.json() as UserSession;
        if (!userSession.is_valid) {
            return false;
        }

        if (!userSession.session?.key || !userSession.session?.expires_at) {
            logger.error(`Invalid session data from server: ${JSON.stringify(userSession)}`);
            return false;
        }

        return userSession;
    } catch (error) {
        logger.error(`API key validation error: ${error}`);
        reporter.sendTelemetryErrorEvent(TELEMETRY_EVENTS.API_KEY_VALIDATION_ERROR, {
            error: JSON.stringify(error),
            api_key: apiKey,
        });
        return false;
    }
}

export async function removeApiKey(
    context: vscode.ExtensionContext,
    client: LanguageClient,
    deactivate: () => Thenable<void> | undefined
): Promise<void> {
    await context.globalState.update(COMMANDS.USER_API_KEY, undefined);

    if (client && client.isRunning()) {
        await client.sendRequest(COMMANDS.UPDATE_CACHED_USER_TOKEN, null);
    } else {
        // Try to restart the client if it's not running before signing out
        try {
            await client.start();
            await client.sendRequest(COMMANDS.UPDATE_CACHED_USER_TOKEN, null);
        } catch (error) {
            vscode.window.showWarningMessage("Client is not running and could not be started. Please try reloadingthe IDE and try again.");
        }
    }

    vscode.window.showInformationMessage(AUTH_MESSAGES.SIGN_OUT);
    deactivate();
}

export const authenticateUserWithGitHub = async (context): Promise<boolean> => {
	logger.info('Authenticating user with GitHub');
    const authProvider = new GitHubAuthProvider(context);
    let session = authProvider.getCurrentSession();
    logger.debug(`Checking current session: ${JSON.stringify(session)}`);
    while (!session?.user.has_agreed_to_terms) {
        logger.debug('User has not agreed to terms, signing in with GitHub');
        try {
            const userSession = await authProvider.signIn();
            logger.debug(`New user session after Github sign in: ${JSON.stringify(userSession)}`);
            if (userSession) {
                if (!userSession.user.has_agreed_to_terms) {
                    const termsAction = "Accept & Continue";
                    const termsResult = await vscode.window.showInformationMessage(
                        AUTH_MESSAGES.WELCOME_SIGNUP_MESSAGE,
                        termsAction
                    );
                    if (termsResult !== termsAction) {
                        vscode.window.showErrorMessage(AUTH_MESSAGES.MUST_AGREE_TO_TERMS);
                        return false;
                    }
                    await authProvider.acceptTerms();
					// Note: only show this the first time the user signs up and accepts terms
					vscode.window.showInformationMessage(AUTH_MESSAGES.WELCOME_MESSAGE);
					reporter.sendTelemetryEvent(TELEMETRY_EVENTS.TERMS_ACCEPTED, {
						user_id: userSession.user.id,
						message: 'User signed up and accepted terms for the first time'
					});
                }
                session = authProvider.getCurrentSession();
            }
        } catch (error) {
            logger.error(`Authentication error: ${error}`);
            if (error instanceof Error && error.message.includes("no email address")) {
                vscode.window.showErrorMessage(AUTH_MESSAGES.NO_EMAIL_ADDRESS, "Okay");
            }
            return false;
        }
    }

    return true;
};

export const authenticateUserWithAPIKey = async (context, activate): Promise<boolean> => {
    let apiKey = context.globalState.get(COMMANDS.USER_API_KEY);

    const retryAction = "Retry";
    const REQUEST_KEY = "Request API Key";

    while (!apiKey) {
        const inputApiKey = await vscode.window.showInputBox({
            prompt: "Please enter your Djazzy API key",
            placeHolder: "API Key",
            ignoreFocusOut: true,
        });

        if (!inputApiKey) {
            const action = await vscode.window.showErrorMessage(
                AUTH_MESSAGES.FREE_API_KEY_PROMPT,
                retryAction,
                REQUEST_KEY
            );

            if (action === retryAction) {
                continue;
            } else if (action === REQUEST_KEY) {
                vscode.env.openExternal(vscode.Uri.parse(API_KEY_SIGNUP_URL));
                await activate(context); // Re-activate the extension and register commands
            }
            return false;
        }

        const isValidApiKey = await validateApiKey(inputApiKey);
        if (!isValidApiKey) {
            const action = await vscode.window.showErrorMessage(
                AUTH_MESSAGES.INVALID_API_KEY,
                retryAction,
                REQUEST_KEY
            );

            if (action === retryAction) {
                continue;
            } else if (action === REQUEST_KEY) {
                vscode.env.openExternal(vscode.Uri.parse(API_KEY_SIGNUP_URL));
                await activate(context);  // Re-activate the extension and register commands
            }
            return false;
        }

        await context.globalState.update(COMMANDS.USER_API_KEY, inputApiKey);
        apiKey = inputApiKey;
    }

	const termsAction = "Accept & Continue";
	const termsResult = await vscode.window.showInformationMessage(
		AUTH_MESSAGES.WELCOME_SIGNUP_MESSAGE,
		termsAction
	);
	if (termsResult !== termsAction) {
		vscode.window.showErrorMessage(AUTH_MESSAGES.MUST_AGREE_TO_TERMS);
		return false;
	}

    return true;
};