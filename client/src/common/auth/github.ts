import * as vscode from "vscode";

import { API_SERVER_URL, SESSION_TOKEN_KEY, SESSION_USER} from "@shared/constants";

export interface UserSession {
	token: string;
	user: {
		id: string;
		email: string;
		github_login: string;
	};
}

export class GitHubAuthProvider {
    constructor(private context: vscode.ExtensionContext) {}

    async signIn(): Promise<UserSession> {
        console.log("Starting GitHub sign-in flow");

        const session = await vscode.authentication.getSession("github", ["read:user", "user:email"], { createIfNone: true });

        if (!session || !session.accessToken) {
            throw new Error("Failed to authenticate with GitHub");
        }

        const userSession = await this.exchangeTokenWithDjango(session.accessToken);
        await this.context.globalState.update(SESSION_TOKEN_KEY, userSession.token);
		await this.context.globalState.update(SESSION_USER, userSession);
        return userSession;
    }

    private async exchangeTokenWithDjango(githubToken: string): Promise<UserSession> {
        const response = await fetch(`${API_SERVER_URL}/_allauth/browser/v1/auth/provider/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
				provider: "github",
				process: "login", // note this will sign the user up if they don't exist
				token: {
					client_id: "Ov23li4Egp5QaJKU3ftO",
					access_token: githubToken,
				}
			})
        });

        if (!response.ok) {
            throw new Error("Failed to exchange GitHub token for Django session token");
        }

        const data = await response.json() as UserSession;
        return data;
    }
}
