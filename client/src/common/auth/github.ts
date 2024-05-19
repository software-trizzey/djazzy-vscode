import uuid from "uuid";

import * as vscode from "vscode";

import { Credentials } from "../../credentials";

const SERVER_URL = "http://127.0.0.1:8000"; // Your Django server URL

export interface UserSession {
	id: string;
	email: string;
	github_login: string;
	profile: {
		name: string;
		location: string;
	};
}

export async function signInWithGitHub(
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
