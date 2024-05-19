import uuid from "uuid";

import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";

import { Credentials } from "../../credentials";

const SERVER_URL = "http://127.0.0.1:8000"; // Your Django server URL
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const REDIRECT_URI = `${SERVER_URL}/accounts/github/login/callback/`;

interface UserSession {
	id: string;
	email: string;
	github_login: string;
	profile: {
		name: string;
		location: string;
	};
}

export async function signInWithGitHub(
	credentials: any, // Adjust type as needed
	client: LanguageClient,
	context: vscode.ExtensionContext,
	deactivate: () => void
) {
	const action = "Sign in with GitHub";
	const response = await vscode.window.showInformationMessage(
		"Sign in to continue using When In Rome. By using this extension you agree to our Terms of Service and Privacy Policy.",
		action,
		"Cancel"
	);
	if (!response || response !== action) {
		console.log("User cancelled sign in.");
		deactivate();
		vscode.window.showInformationMessage(
			"When In Rome extension has been disabled. Vale! 👋"
		);
		return;
	}

	const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
	console.log("Opening browser to:", authUrl);
	vscode.env.openExternal(vscode.Uri.parse(authUrl));
	// TODO: you need a method for handling the token returned by the server
	// startPollingForSessionToken(context);
}

// Register the URI handler to handle the redirect back to VS Code
export const handleUri = async (uri: vscode.Uri, context) => {
	console.log("Handling URI...");

	const query = new URLSearchParams(uri.query);
	const code = query.get("code");

	if (!code) {
		vscode.window.showErrorMessage("Authentication failed: no code received.");
		return;
	}

	try {
		const serverResponse: any = await fetch(
			`${SERVER_URL}/dj-rest-auth/github/`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					code: code,
					redirect_uri: REDIRECT_URI,
					client_id: CLIENT_ID,
				}),
			}
		);

		const parsedResponse = await serverResponse.json();
		console.log("Parsed response:", parsedResponse);

		if (parsedResponse && parsedResponse.data.key) {
			await context.globalState.update("whenInRomeUser", serverResponse.key);
			vscode.window.showInformationMessage(
				`Welcome to Rome, ${serverResponse.user.github_login}! 🏛️🫡`
			);
		} else {
			vscode.window.showErrorMessage(
				`Authentication failed: ${serverResponse.error}`
			);
		}
	} catch (error) {
		console.error("Failed to authenticate with GitHub:", error);
		vscode.window.showErrorMessage("GitHub authentication failed");
	}
};

async function checkForSessionToken(context: vscode.ExtensionContext) {
	try {
		const response = await fetch(`${SERVER_URL}/check-session-token/`, {
			headers: {
				Authorization: `Bearer ${context.globalState.get(
					"whenInRomeSessionToken"
				)}`,
			},
		});

		const data: any = await response.json();
		console.log(data);

		if (data.token) {
			await context.globalState.update("whenInRomeSessionToken", data.token);
			vscode.window.showInformationMessage(`Welcome to Rome! 🏛️🫡`);
			return data.token;
		}
	} catch (error) {
		console.error("Failed to fetch session token:", error);
	}
	return null;
}

export async function signInWithGitHubV1(
	credentials: Credentials,
	context: vscode.ExtensionContext,
	deactivate: () => void
) {
	const action = "Sign in with GitHub";
	const response = await vscode.window.showInformationMessage(
		"Sign in to continue using When In Rome. By using this extension you agree to our Terms of Service and Privacy Policy.",
		action,
		"Cancel"
	);
	if (!response || response !== action) {
		console.log("User cancelled sign in.");
		deactivate();
		vscode.window.showInformationMessage(
			"When In Rome extension has been disabled. Vale! 👋"
		);
		return;
	}
	const octokit = await credentials.getOctokit();
	const userInfo = await octokit.users.getAuthenticated();

	const newUser = {
		email: userInfo.data.email,
		password: "Masterful1" || uuid.v4(),
		github_login: userInfo.data.login,
		has_agreed_to_terms: true,
		profile: {
			name: userInfo.data.name,
			location: userInfo.data.location,
		},
	};

	const serverResponse: any = await fetch(`${SERVER_URL}/auth/users/`, {
		headers: {
			"Content-Type": "application/json",
		},
		method: "POST",
		body: JSON.stringify(newUser),
	});

	if (serverResponse.ok) {
		const responseData = await serverResponse.json();
		await context.globalState.update("whenInRomeUserToken", responseData.token);
		await context.globalState.update("whenInRomeUser", responseData.user);
		vscode.window.showInformationMessage(
			`Welcome to Rome, ${responseData.user.github_login}! 🏛️🫡`
		);
	} else {
		vscode.window.showErrorMessage(
			`Authentication failed: ${serverResponse.error}`
		);
	}
}
