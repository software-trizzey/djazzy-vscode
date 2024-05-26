import * as vscode from "vscode";

import uuid from "uuid";

import logger from "../logs";
import { AUTH_SERVER_URL } from "../constants";

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

	const serverResponse: any = await fetch(`${AUTH_SERVER_URL}/auth/users/`, {
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
		vscode.window.showErrorMessage(`Authentication failed: ${serverResponse}`);
		logger.error(serverResponse.error);
		console.log(serverResponse);
	}
}

export async function signOutUser(context: vscode.ExtensionContext) {
	const token = context.globalState.get("whenInRomeUserToken");

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

	await context.globalState.update("whenInRomeUser", undefined);
	await context.globalState.update("whenInRomeUserToken", undefined);
}
