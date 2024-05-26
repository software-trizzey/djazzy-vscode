import * as vscode from "vscode";

import { v4 as uuidv4 } from "uuid";

import logger from "../logs";
import { AUTH_SERVER_URL, SESSION_TOKEN_KEY, SESSION_USER } from "../constants";

import { Credentials } from "./github";

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

	const userPayload = {
		email: userInfo.data.email,
		password: uuidv4(), // TODO: sign up user with random password for MVP
		github_login: userInfo.data.login,
		has_agreed_to_terms: true,
		profile: {
			name: userInfo.data.name,
			location: userInfo.data.location,
		},
	};

	const serverResponse: any = await fetch(`${AUTH_SERVER_URL}/auth/users/`, {
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
			`Welcome to Rome, ${responseData.user.github_login}! 🏛️🫡`
		);
	} else {
		vscode.window.showErrorMessage(
			`Authentication failed: ${serverResponse.error}`
		);
		console.error(serverResponse.error);
		logger.error(serverResponse.error);
	}
}

export async function signOutUser(context: vscode.ExtensionContext) {
	const token = context.globalState.get(SESSION_TOKEN_KEY);

	if (token) {
		try {
			const response = await fetch(`${AUTH_SERVER_URL}/auth/logout/`, {
				method: "POST",
				headers: {
					Authorization: `Token ${token}`,
				},
			});

			if (response.ok) {
				vscode.window.showInformationMessage(
					"Signed out of When In Rome. Vale! 👋"
				);
			} else {
				throw new Error("Error signing out from the server.");
			}
		} catch (error) {
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
}
