import * as vscode from "vscode";

import uuid from "uuid";
import * as Octokit from "@octokit/rest";

const AUTH_SERVER_URL =
	process.env.NODE_ENV === "production"
		? "https://rome-django-auth.onrender.com"
		: "http://127.0.0.1:8000";
const GITHUB_AUTH_PROVIDER_ID = "github";
// The GitHub Authentication Provider accepts the scopes described here:
// https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
const SCOPES = ["user:email"];

export class Credentials {
	private octokit: Octokit.Octokit | undefined;

	async initialize(context: vscode.ExtensionContext): Promise<void> {
		this.registerListeners(context);
		await this.setOctokit();
	}

	private async setOctokit() {
		/**
		 * By passing the `createIfNone` flag, a numbered badge will show up on the accounts activity bar icon.
		 * An entry for the sample extension will be added under the menu to sign in. This allows quietly
		 * prompting the user to sign in.
		 * */
		const session = await vscode.authentication.getSession(
			GITHUB_AUTH_PROVIDER_ID,
			SCOPES,
			{ createIfNone: true }
		);

		if (session) {
			this.octokit = new Octokit.Octokit({
				auth: session.accessToken,
			});

			return;
		}

		this.octokit = undefined;
	}

	registerListeners(context: vscode.ExtensionContext): void {
		/**
		 * Sessions are changed when a user logs in or logs out.
		 */
		context.subscriptions.push(
			vscode.authentication.onDidChangeSessions(async (e) => {
				if (e.provider.id === GITHUB_AUTH_PROVIDER_ID) {
					await this.setOctokit();
				}
			})
		);
	}

	async getOctokit(): Promise<Octokit.Octokit> {
		if (this.octokit) {
			return this.octokit;
		}

		/**
		 * When the `createIfNone` flag is passed, a modal dialog will be shown asking the user to sign in.
		 * Note that this can throw if the user clicks cancel.
		 */
		const session = await vscode.authentication.getSession(
			GITHUB_AUTH_PROVIDER_ID,
			SCOPES,
			{ createIfNone: true }
		);
		this.octokit = new Octokit.Octokit({
			auth: session.accessToken,
		});

		return this.octokit;
	}
}

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
		vscode.window.showErrorMessage(
			`Authentication failed: ${serverResponse.error}`
		);
	}
}
