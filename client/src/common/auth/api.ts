import * as vscode from "vscode";

import { v4 as uuidv4 } from "uuid";

import logger from "../logs";
import { API_KEY_SIGNUP_URL, API_SERVER_URL, COMMANDS, SESSION_TOKEN_KEY, SESSION_USER } from "../constants";

import { Credentials } from "./github";
import { LanguageClient } from 'vscode-languageclient/node';

export async function signInWithGitHub(
	credentials: Credentials,
	context: vscode.ExtensionContext,
	deactivate: () => void
) {
	const action = "Sign in with GitHub";
	const response = await vscode.window.showInformationMessage(
		"Sign in to continue using Djangoly. By using this extension you agree to our Terms of Service and Privacy Policy.",
		action,
		"Cancel"
	);
	if (!response || response !== action) {
		console.log("User cancelled sign in.");
		deactivate();
		vscode.window.showInformationMessage(
			"Djangoly extension has been disabled. Bye! 👋"
		);
		return;
	}
	const octokit = await credentials.getOctokit();
	const userInfo = await octokit.users.getAuthenticated();

	const userPayload = {
		email: userInfo.data.email || null, // djangoly-ignore: some users might not have public emails
		password: uuidv4(),
		github_login: userInfo.data.login,
		has_agreed_to_terms: true,
		profile: {
			name: userInfo.data.name,
			location: userInfo.data.location,
		},
	};

	const serverResponse: any = await fetch(`${API_SERVER_URL}/auth/users/login/`, {
		headers: {
			"Content-Type": "application/json",
		},
		method: "POST",
		body: JSON.stringify(userPayload),
	});
	const responseData = await serverResponse.json();

	if (serverResponse.ok) {
		await context.globalState.update(SESSION_TOKEN_KEY, responseData.token);
		await context.globalState.update(SESSION_USER, responseData.user);
		vscode.window.showInformationMessage(
			`Welcome to Djangoly, ${responseData.user.github_login || responseData.user.email}! 🏛️🫡`
		);
	} else {
		vscode.window.showErrorMessage(
			`Authentication failed: ${responseData.detail || responseData.error || responseData.message}`
		);
		console.error(responseData);
		logger.error(responseData);
	}
}

export async function signOutUser(context: vscode.ExtensionContext, client: LanguageClient) {
	const token = context.globalState.get(SESSION_TOKEN_KEY);

	if (token) {
		try {
			const response = await fetch(`${API_SERVER_URL}/auth/logout/`, {
				method: "POST",
				headers: {
					Authorization: `Token ${token}`,
				},
			});

			if (response.ok) {
				vscode.window.showInformationMessage(
					"Signed out of Djangoly. Bye! 👋"
				);
			} else {
				const responseData = (await response.json()) as any;
				console.error(responseData.error);
			}
		} catch (error: any) {
			vscode.window.showErrorMessage("Error signing out from the server.");
			logger.error(error);
		}
	} else {
		const errorMessage = "No token found, signing out locally.";
		vscode.window.showInformationMessage(errorMessage);
		logger.error(errorMessage);
	}

	await context.globalState.update(SESSION_USER, undefined);
	await context.globalState.update(SESSION_TOKEN_KEY, undefined);

	await client.sendRequest(COMMANDS.UPDATE_CACHED_USER_TOKEN, null);

	vscode.commands.executeCommand('workbench.action.reloadWindow');
}


export async function validateApiKey(apiKey: string): Promise<boolean> {
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

		const data: any = await response.json();
		return data.is_valid;
    } catch (error) {
        logger.error('Error validating API key:', error);
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
            vscode.window.showWarningMessage("Client is not running and could not be started. Please try reloading your developer window and try again.");
        }
    }

    vscode.window.showInformationMessage("You have deactivated Djangoly. See ya! 👋");
    deactivate();
}

export const authenticateUser = async (context, activate): Promise<boolean> => {
    let apiKey = context.globalState.get(COMMANDS.USER_API_KEY);

    const retryAction = "Retry";
    const REQUEST_KEY = "Request API Key";

    while (!apiKey) {
        const inputApiKey = await vscode.window.showInputBox({
            prompt: "Please enter your Djangoly API key",
            placeHolder: "API Key",
            ignoreFocusOut: true,
        });

        if (!inputApiKey) {
            const action = await vscode.window.showErrorMessage(
                "A valid API key is required to use Djangoly. If you don't have an API key, you can request one by completing the form.",
                retryAction,
                REQUEST_KEY
            );

            if (action === retryAction) {
                continue;
            } else if (action === REQUEST_KEY) {
                vscode.env.openExternal(vscode.Uri.parse(API_KEY_SIGNUP_URL));
                // Re-activate the extension and register commands
                await activate(context);
            }
            return false;
        }

        const isValidApiKey = await validateApiKey(inputApiKey);
        if (!isValidApiKey) {
            const action = await vscode.window.showErrorMessage(
                "Invalid API key. Please try again or request a new API key using the form.",
                retryAction,
                REQUEST_KEY
            );

            if (action === retryAction) {
                continue;
            } else if (action === REQUEST_KEY) {
                vscode.env.openExternal(vscode.Uri.parse(API_KEY_SIGNUP_URL));
                // Re-activate the extension and register commands
                await activate(context);
            }
            return false;
        }

        await context.globalState.update(COMMANDS.USER_API_KEY, inputApiKey);
        vscode.window.showInformationMessage("Welcome to Djangoly (Beta)! 👋");
        apiKey = inputApiKey;
    }

    return true;
};